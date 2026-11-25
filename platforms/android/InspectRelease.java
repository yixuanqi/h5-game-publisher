import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.zip.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;

class InspectRelease {
  static final String ANDROID="http://schemas.android.com/apk/res/android";
  static String attr(Element e,String key){return e.getAttributeNS(ANDROID,key);}
  static Element one(Element e,String tag){
    var nodes=e.getElementsByTagName(tag);
    if(nodes.getLength()!=1)throw new SecurityException("Expected one "+tag);
    return (Element)nodes.item(0);
  }
  static void eq(String a,String b,String name){if(!a.equals(b))throw new SecurityException(name+" mismatch: "+a+" != "+b);}
  static void notTrue(Element e,String key){
    var v=attr(e,key);if(!v.isEmpty()&&!v.equals("false")&&!v.equals("0"))throw new SecurityException("Unexpected "+key+": "+v);
  }
  static String hash(InputStream input) throws Exception {
    try(input){var md=MessageDigest.getInstance("SHA-256");byte[] buf=new byte[65536];int n;while((n=input.read(buf))!=-1)md.update(buf,0,n);return HexFormat.of().formatHex(md.digest());}
  }
  public static void main(String[] args) throws Exception {
    if(args.length!=8)throw new IllegalArgumentException("aab xml package code name orientation target-min min-max");
    var f=DocumentBuilderFactory.newInstance();f.setNamespaceAware(true);
    f.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
    f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
    var manifest=f.newDocumentBuilder().parse(new File(args[1])).getDocumentElement();
    eq(manifest.getTagName(),"manifest","document");eq(manifest.getAttribute("package"),args[2],"package");
    eq(attr(manifest,"versionCode"),args[3],"versionCode");eq(attr(manifest,"versionName"),args[4],"versionName");
    var sdk=one(manifest,"uses-sdk");
    int min=Integer.parseInt(attr(sdk,"minSdkVersion")),target=Integer.parseInt(attr(sdk,"targetSdkVersion"));
    if(min<1||min>Integer.parseInt(args[7])||target<Integer.parseInt(args[6])||target<min)throw new SecurityException("SDK policy mismatch");
    var app=one(manifest,"application");notTrue(app,"debuggable");notTrue(app,"testOnly");
    var activities=app.getElementsByTagName("activity");Element main=null;
    for(int i=0;i<activities.getLength();i++){var e=(Element)activities.item(i);var n=attr(e,"name");if(n.equals(".MainActivity")||n.equals(args[2]+".MainActivity")){if(main!=null)throw new SecurityException("Duplicate MainActivity");main=e;}}
    if(main==null)throw new SecurityException("Missing MainActivity");
    var exported=attr(main,"exported");if(!exported.equals("true")&&!exported.equals("1"))throw new SecurityException("MainActivity not exported");
    var orient=attr(main,"screenOrientation");
    var orientationValues=Map.of("landscape","0","portrait","1","sensorLandscape","6","unspecified","-1");
    if(!orient.equals(args[5])&&!orient.equals(orientationValues.get(args[5]))&&!(args[5].equals("unspecified")&&orient.isEmpty()))throw new SecurityException("Orientation mismatch: "+orient);
    System.out.println("SDK\t"+min+"\t"+target);
    var permissions=manifest.getElementsByTagName("uses-permission");
    for(int i=0;i<permissions.getLength();i++)System.out.println("PERMISSION\t"+attr((Element)permissions.item(i),"name"));
    String prefix="base/assets/public/";
    Set<String> seen=new HashSet<>();
    try(var zip=new ZipFile(args[0])){
      for(var e:Collections.list(zip.entries())){
        String n=e.getName();
        if(!seen.add(n)||n.startsWith("/")||n.contains("\\")||Arrays.asList(n.split("/")).contains(".."))throw new SecurityException("Unsafe or duplicate ZIP path "+n);
        if(e.isDirectory()||!n.startsWith(prefix))continue;
        String p=n.substring(prefix.length());if(p.isEmpty()||p.contains("\t")||p.contains("\n")||p.contains("\r"))throw new SecurityException("Unsafe asset name");
        System.out.println("ASSET\t"+p+"\t"+hash(zip.getInputStream(e)));
      }
    }
  }
}
