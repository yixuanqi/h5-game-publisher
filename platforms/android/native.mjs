import fs from 'node:fs';
import path from 'node:path';
import {sha256,within} from '../../scripts/source-integrity.mjs';

export function validateAndroid(c){
  const a=c.android;
  if(a===undefined)return;
  if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Invalid android configuration');
  for(const k of Object.keys(a))if(!['immersive','icon','splashColor'].includes(k))throw Error('Unknown android option: '+k);
  if(a.immersive!==undefined&&typeof a.immersive!=='boolean')throw Error('Invalid immersive flag');
  if(a.icon!==undefined&&(typeof a.icon!=='string'||!(a.icon==='publisher-demo'||/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.png$/.test(a.icon))))throw Error('Invalid Android icon path');
  if(a.splashColor!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(a.splashColor))throw Error('Invalid splashColor');
  if(a.splashColor&&!a.icon)throw Error('Splash branding requires an icon');
}
export function validatePng(b){
  if(b.length<33||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||b.readUInt32BE(8)!==13||b.toString('ascii',12,16)!=='IHDR')throw Error('Invalid PNG header');
  if(b.readUInt32BE(16)!==512||b.readUInt32BE(20)!==512)throw Error('Android icon must be 512x512 PNG');
}
const demoVector='<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#173042" android:pathData="M0,0H108V108H0Z"/><path android:fillColor="#80D8CF" android:pathData="M27,30H40V48H68V30H81V78H68V60H40V78H27Z"/></vector>\n';
export function planAndroid(c,web){
  validateAndroid(c);
  const a=c.android??{};
  let icon=null;
  if(a.icon==='publisher-demo'){if(c.id!=='demo')throw Error('Demo icon reserved for demo');icon={ext:'xml',bytes:Buffer.from(demoVector)};}
  else if(a.icon){
    const f=path.join(web,a.icon);
    if(!within(web,fs.realpathSync(f)))throw Error('Android icon escapes staged source');
    const bytes=fs.readFileSync(f);validatePng(bytes);icon={ext:'png',bytes};
  }
  return {immersive:a.immersive??false,icon,splashColor:a.splashColor??null,identity:{immersive:a.immersive??false,icon:a.icon??null,iconSha256:icon?sha256(icon.bytes):null,splashColor:a.splashColor??null}};
}
function replaceOnce(s,re,replace,label){
  const flags=re.flags.includes('g')?re.flags:re.flags+'g';
  if([...s.matchAll(new RegExp(re.source,flags))].length!==1)throw Error('Unexpected Android template: '+label);
  return s.replace(re,replace);
}
export function patchActivity(s){
  // Keep Capacitor's generated Activity implementation and imports, add only the native bar policy.
  return replaceOnce(s,/public class MainActivity extends BridgeActivity\s*\{/,m=>m+
    '\n    @Override\n    public void onWindowFocusChanged(boolean hasFocus) {\n        super.onWindowFocusChanged(hasFocus);\n        if (hasFocus) h5PublisherHideBars();\n    }\n'+
    '    @Override\n    public void onResume() {\n        super.onResume();\n        h5PublisherHideBars();\n    }\n'+
    '    private void h5PublisherHideBars() {\n        androidx.core.view.WindowInsetsControllerCompat bars = androidx.core.view.WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());\n        bars.setSystemBarsBehavior(androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);\n        bars.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars());\n    }\n','MainActivity declaration');
}
export function patchBrandManifest(s,plan){
  if(!plan.icon)return s;
  for(const attr of ['icon','roundIcon']){
    s=replaceOnce(s,new RegExp('android:'+attr+'="[^"]+"'),'android:'+attr+'="@drawable/h5publisher_icon"',attr);
  }
  if(plan.splashColor)s=replaceOnce(s,/android:theme="@style\/AppTheme\.NoActionBarLaunch"/,'android:theme="@style/H5PublisherLaunchTheme"','launch theme');
  return s;
}
export function applyAndroid(android,c,plan){
  const main=path.join(android,'app','src','main'),res=path.join(main,'res');
  if(plan.immersive){
    const activity=path.join(main,'java',...c.appId.split('.'),'MainActivity.java');
    fs.writeFileSync(activity,patchActivity(fs.readFileSync(activity,'utf8')));
  }
  if(plan.icon){
    const draw=path.join(res,'drawable-nodpi');fs.mkdirSync(draw,{recursive:true});
    fs.writeFileSync(path.join(draw,'h5publisher_icon.'+plan.icon.ext),plan.icon.bytes);
    const manifest=path.join(main,'AndroidManifest.xml');
    fs.writeFileSync(manifest,patchBrandManifest(fs.readFileSync(manifest,'utf8'),plan));
    if(plan.splashColor){
      const styles='<resources><style name="H5PublisherLaunchTheme" parent="Theme.SplashScreen"><item name="windowSplashScreenBackground">'+plan.splashColor+'</item><item name="windowSplashScreenAnimatedIcon">@drawable/h5publisher_icon</item><item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item></style></resources>\n';
      fs.writeFileSync(path.join(res,'values','h5publisher_launch.xml'),styles);
    }
  }
}
