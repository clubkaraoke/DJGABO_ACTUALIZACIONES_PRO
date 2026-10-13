import { useEffect,useState,type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Crown, LockKeyhole } from "lucide-react";
import { api } from "../lib/apiClient";

export default function ActivateManualClientPage(){
 const [token]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get("token")||"");
 const [password,setPassword]=useState("");
 const [confirm,setConfirm]=useState("");
 const [loading,setLoading]=useState(false);
 const [success,setSuccess]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
   // Avoid leaving bearer-style one-time tokens in URL/history or referrer.
   window.history.replaceState(null,"",window.location.pathname);
 },[]);
 async function submit(e:FormEvent){
   e.preventDefault();
   if(password!==confirm){setError("Las contraseñas no coinciden");return;}
   setLoading(true);setError("");
   try{
     await api.post("/auth/activate-manual-client",{token,password});
     setSuccess(true);setPassword("");setConfirm("");
   }catch(e){setError(e instanceof Error?e.message:"No se pudo activar la cuenta");}
   finally{setLoading(false);}
 }
 return <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
   <div className="w-full max-w-[430px] space-y-5">
     <div className="text-center"><Crown className="mx-auto mb-3 h-10 w-10 text-primary"/>
       <h1 className="text-2xl font-bold">Activa tu cuenta VIP DJGABO</h1>
       <p className="mt-2 text-sm text-muted-foreground">Tu membresía ya fue registrada. Configura tu contraseña personal para acceder al panel.</p>
     </div>
     {success?<section className="space-y-4 rounded-lg border border-emerald-500/30 bg-card p-6 text-center">
       <h2 className="font-semibold text-emerald-400">¡Tu contraseña se creó correctamente!</h2>
       <p className="text-sm text-muted-foreground">Ya puedes iniciar sesión con tu correo y contraseña.</p>
       <Link to="/login" className="inline-flex rounded-md bg-primary px-5 py-2 font-semibold text-black">Ingresar al panel VIP</Link>
     </section>:!token?<div role="alert" className="rounded-lg bg-card p-5 text-center text-sm">Enlace inválido o incompleto. Solicita uno nuevo a DJGABO.</div>:
     <form onSubmit={submit} className="space-y-4 rounded-lg border border-white/[0.07] bg-card p-6">
       <label className="block text-sm">Crea tu contraseña
         <input type="password" minLength={8} maxLength={128} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}
           className="mt-1 w-full rounded-md border border-white/[0.10] bg-secondary p-3" placeholder="Mínimo 8 caracteres"/>
       </label>
       <label className="block text-sm">Confirma tu contraseña
         <input type="password" minLength={8} maxLength={128} required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}
           className="mt-1 w-full rounded-md border border-white/[0.10] bg-secondary p-3"/>
       </label>
       {error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
       <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-black disabled:opacity-50">
         <LockKeyhole className="h-4 w-4"/>{loading?"Activando…":"Crear contraseña y activar acceso"}
       </button>
       <p className="text-xs text-muted-foreground">El enlace es válido por 48 horas, y se utiliza una sola vez. No compartas tu contraseña.</p>
     </form>}
   </div>
 </main>;
}
