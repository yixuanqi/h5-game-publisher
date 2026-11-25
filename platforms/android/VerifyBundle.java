import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.jar.*;
import java.util.zip.*;

class VerifyBundle {
    static boolean signatureMetadata(String n) {
        String s=n.toUpperCase(Locale.ROOT);
        return s.equals("META-INF/MANIFEST.MF") || s.matches("META-INF/[^/]+\\.(SF|RSA|DSA|EC)") || s.matches("META-INF/SIG-[^/]+");
    }
    static String hex(byte[] data) { return HexFormat.of().formatHex(data); }
    static String digest(InputStream in) throws Exception {
        try(in){ MessageDigest md=MessageDigest.getInstance("SHA-256"); byte[] b=new byte[65536];int n;
            while((n=in.read(b))!=-1)md.update(b,0,n);return hex(md.digest()); }
    }
    static void checkName(String n,Set<String> seen) {
        if(n.startsWith("/")||n.contains("\\")||Arrays.asList(n.split("/")).contains("..")||!seen.add(n))throw new SecurityException("Unsafe or duplicate entry: "+n);
    }
    public static void main(String[] args) throws Exception {
        if(args.length!=3)throw new IllegalArgumentException("unsigned, signed, certificate SHA256 required");
        String pin=args[2].toLowerCase(Locale.ROOT);
        Map<String,String> original=new TreeMap<>(),signed=new TreeMap<>();
        Set<String> seen=new HashSet<>();
        try(ZipFile z=new ZipFile(args[0])) {
            for(var e:Collections.list(z.entries())){
                String n=e.getName();checkName(n,seen);
                if(e.isDirectory())continue;
                if(signatureMetadata(n)){if(!n.equalsIgnoreCase("META-INF/MANIFEST.MF"))throw new SecurityException("Input already signed");continue;}
                original.put(n,digest(z.getInputStream(e)));
            }
        }
        if(!original.containsKey("BundleConfig.pb")||!original.containsKey("base/manifest/AndroidManifest.xml"))throw new SecurityException("Missing AAB structure");
        seen.clear();
        try(JarFile j=new JarFile(args[1],true)){
            for(var e:Collections.list(j.entries())){
                String n=e.getName();checkName(n,seen);
                if(e.isDirectory()||signatureMetadata(n))continue;
                signed.put(n,digest(j.getInputStream(e)));
                var signers=e.getCodeSigners();
                if(signers==null||signers.length!=1)throw new SecurityException("Unsigned or multiple signers: "+n);
                var cert=signers[0].getSignerCertPath().getCertificates().get(0);
                if(cert instanceof java.security.cert.X509Certificate x)x.checkValidity();
                String actual=hex(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()));
                if(!pin.equals(actual))throw new SecurityException("Signer certificate mismatch");
            }
        }
        if(!original.equals(signed))throw new SecurityException("Bundle payload changed during signing");
        System.out.println("Verified "+signed.size()+" signed payload entries and certificate "+pin);
    }
}
