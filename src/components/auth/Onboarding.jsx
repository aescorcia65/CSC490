import { useState } from "react";
import { motion } from "framer-motion";
import { UserCircle2, Loader2, Stethoscope } from "lucide-react";
import { supabase } from "../../supabase";
import { useAuth } from "../../contexts/AuthContext";

const SPECIALTIES = [
  "Primary Care / Family Medicine","Internal Medicine","Cardiology","Dermatology",
  "Endocrinology","Gastroenterology","Geriatrics","Neurology","OB-GYN","Oncology",
  "Ophthalmology","Orthopedics","Pediatrics","Psychiatry","Pulmonology",
  "Rheumatology","Urology","Other",
];

export default function Onboarding({ user, initialProfile, onComplete }) {
  const { setOnboardingComplete } = useAuth();

  const role = user?.user_metadata?.role || initialProfile?.role || "patient";
  const isDoctor = role === "doctor";
  const isPharmacist = role === "pharmacist";

  const [firstName, setFirstName] = useState(initialProfile?.first_name || user?.user_metadata?.full_name || "");
  const [lastName,  setLastName]  = useState(initialProfile?.last_name || "");
  const [age,       setAge]       = useState(initialProfile?.age ?? "");
  const [sex,       setSex]       = useState(initialProfile?.sex || "");
  const [specialty, setSpecialty] = useState(initialProfile?.specialty || "");
  const [licenseNo, setLicenseNo] = useState(initialProfile?.license_number || "");
  const [pharmName, setPharmName] = useState(initialProfile?.pharmacy_name || "");
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  async function submit(e) {
    e?.preventDefault();
    if (!firstName?.trim()) { setErr("Please enter your first name."); return; }
    if (isDoctor && !specialty) { setErr("Please select your specialty."); return; }
    setBusy(true); setErr("");
    try {
      const updates = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      };
      if (!isDoctor && !isPharmacist) {
        updates.age = age ? parseInt(age, 10) : null;
        updates.sex = sex || null;
      }
      if (isDoctor) {
        updates.specialty = specialty || null;
        updates.license_number = licenseNo.trim() || null;
      }
      if (isPharmacist) {
        updates.pharmacy_name = pharmName.trim() || null;
      }

      const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
      if (error) throw error;

      setOnboardingComplete(true);
      onComplete?.({ first_name: firstName.trim() });
    } catch (e) {
      setErr(e.message || "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const rT2="#d4e4ff"; const rT3="#7a9acc";
  const accentColor = isDoctor?"#0e7490":isPharmacist?"#7c3aed":"#2563eb";
  const accentBg    = isDoctor?"rgba(14,116,144,.2)":isPharmacist?"rgba(124,58,237,.2)":"rgba(37,99,235,.2)";
  const accentBd    = isDoctor?"rgba(14,116,144,.35)":isPharmacist?"rgba(124,58,237,.35)":"rgba(37,99,235,.35)";
  const subtitle    = isDoctor?"Complete your doctor profile":isPharmacist?"Complete your pharmacist profile":"Complete your profile to get started";

  const INP = {
    width:"100%", padding:"13px 16px", background:"rgba(255,255,255,.08)",
    border:"1.5px solid rgba(255,255,255,.18)", borderRadius:12, color:"#fff",
    fontFamily:"'DM Sans',sans-serif", fontSize:14.5, outline:"none",
    transition:"all .2s", caretColor:accentColor,
  };
  const LBL = {
    display:"block", fontSize:11, fontWeight:700, color:rT2,
    letterSpacing:".07em", textTransform:"uppercase", marginBottom:8,
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center", fontFamily:"'DM Sans',sans-serif",
      background:"#080b14", padding:24 }}>
      <style>{`.ob-inp:focus{border-color:${accentColor}!important;box-shadow:0 0 0 3.5px ${accentBd}!important;background:rgba(255,255,255,.12)!important}`}</style>
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:.35}}
        style={{ width:"100%", maxWidth:480, background:"rgba(22,27,34,.92)",
          border:"1px solid rgba(255,255,255,.09)", borderRadius:22, padding:"36px 40px",
          boxShadow:"0 24px 56px rgba(0,0,0,.45)" }}>

        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:28}}>
          <div style={{width:50,height:50,borderRadius:15,background:accentBg,
            border:`1px solid ${accentBd}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {isDoctor ? <Stethoscope size={24} color={accentColor}/> : <UserCircle2 size={24} color={accentColor}/>}
          </div>
          <div>
            <h1 style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:23,fontStyle:"italic",color:"#fff",margin:0}}>
              Welcome to MedTrack
            </h1>
            <p style={{color:rT3,fontSize:13,marginTop:3}}>{subtitle}</p>
          </div>
        </div>

        {(isDoctor||isPharmacist) && (
          <div style={{display:"inline-flex",alignItems:"center",gap:7,padding:"5px 14px",
            borderRadius:99,marginBottom:22,background:accentBg,border:`1px solid ${accentBd}`}}>
            <span style={{color:accentColor,fontSize:12,fontWeight:800,
              textTransform:"uppercase",letterSpacing:".1em"}}>
              {isDoctor?"Doctor Portal":"Pharmacist Portal"}
            </span>
          </div>
        )}

        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:15}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={LBL}>First name *</label>
              <input className="ob-inp" style={INP} type="text" value={firstName}
                placeholder="Jamie" onChange={e=>setFirstName(e.target.value)} autoFocus/>
            </div>
            <div>
              <label style={LBL}>Last name</label>
              <input className="ob-inp" style={INP} type="text" value={lastName}
                placeholder="Smith" onChange={e=>setLastName(e.target.value)}/>
            </div>
          </div>

          {isDoctor && (<>
            <div>
              <label style={LBL}>Specialty *</label>
              <select className="ob-inp" style={{...INP,color:specialty?"#fff":rT3}}
                value={specialty} onChange={e=>setSpecialty(e.target.value)}>
                <option value="">Select your specialty</option>
                {SPECIALTIES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>License / NPI number (optional)</label>
              <input className="ob-inp" style={INP} type="text" value={licenseNo}
                placeholder="e.g. 1234567890" onChange={e=>setLicenseNo(e.target.value)}/>
            </div>
          </>)}

          {isPharmacist && (
            <div>
              <label style={LBL}>Pharmacy name (optional)</label>
              <input className="ob-inp" style={INP} type="text" value={pharmName}
                placeholder="e.g. Downtown Pharmacy" onChange={e=>setPharmName(e.target.value)}/>
            </div>
          )}

          {!isDoctor && !isPharmacist && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div>
                <label style={LBL}>Age</label>
                <input className="ob-inp" style={INP} type="number" min={1} max={120}
                  value={age} placeholder="Age" onChange={e=>setAge(e.target.value)}/>
              </div>
              <div>
                <label style={LBL}>Sex</label>
                <select className="ob-inp" style={INP} value={sex} onChange={e=>setSex(e.target.value)}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>
          )}

          {err && (
            <div style={{padding:"10px 14px",borderRadius:10,
              background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.25)",
              color:"#fca5a5",fontSize:13}}>
              {err}
            </div>
          )}

          <button type="submit" disabled={busy} style={{
            width:"100%", padding:14, marginTop:6,
            background:`linear-gradient(135deg,${accentColor},${accentColor}bb)`,
            border:"none", borderRadius:12, color:"#fff",
            fontFamily:"inherit", fontSize:14, fontWeight:700,
            cursor:busy?"default":"pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            boxShadow:`0 4px 20px ${accentBd}`,
          }}>
            {busy ? <Loader2 size={16} className="auth-spin"/> : "Continue to MedTrack →"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}