
export const DOSAGE_UNITS = [
  { value: "mg", label: "mg (milligrams)" },
  { value: "g", label: "g (grams)" },
  { value: "mcg", label: "mcg (micrograms)" },
  { value: "mL", label: "mL (milliliters)" },
  { value: "L", label: "L (liters)" },
  { value: "tablet(s)", label: "tablet(s)" },
  { value: "capsule(s)", label: "capsule(s)" },
  { value: "drop(s)", label: "drop(s)" },
  { value: "patch(es)", label: "patch(es)" },
  { value: "puff(s)", label: "puff(s)" },
  { value: "unit(s)", label: "unit(s)" },
  { value: "IU", label: "IU (international units)" },
  { value: "mEq", label: "mEq (milliequivalents)" },
  { value: "mg/mL", label: "mg/mL (concentration)" },
  { value: "tsp", label: "tsp (teaspoon)" },
  { value: "tbsp", label: "tbsp (tablespoon)" },
  { value: "%", label: "% (topical)" },
];

export const FREQUENCY_OPTIONS = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Four times daily",
  "Every 1 hour",
  "Every 2 hours",
  "Every 3 hours",
  "Every 4 hours",
  "Every 6 hours",
  "Every 8 hours",
  "Every 12 hours",
  "Once weekly",
  "Twice weekly",
  "Every other day",
  "As needed (PRN)",
  "At bedtime",
  "With meals",
  "Before meals",
  "After meals",
];

export const MEDICATIONS = [
  { name: "Acetaminophen (Tylenol)", category: "Pain Relief", defaultDosage: "500", defaultUnit: "mg", commonDosages: ["325", "500", "650", "1000"] },
  { name: "Ibuprofen (Advil)", category: "NSAID", defaultDosage: "200", defaultUnit: "mg", commonDosages: ["200", "400", "600", "800"] },
  { name: "Naproxen (Aleve)", category: "NSAID", defaultDosage: "250", defaultUnit: "mg", commonDosages: ["220", "250", "375", "500"] },
  { name: "Aspirin", category: "NSAID", defaultDosage: "325", defaultUnit: "mg", commonDosages: ["81", "162", "325", "500"] },
  { name: "Meloxicam (Mobic)", category: "NSAID", defaultDosage: "7.5", defaultUnit: "mg", commonDosages: ["7.5", "15"] },
  { name: "Celecoxib (Celebrex)", category: "NSAID", defaultDosage: "200", defaultUnit: "mg", commonDosages: ["100", "200", "400"] },
  { name: "Diclofenac (Voltaren)", category: "NSAID", defaultDosage: "50", defaultUnit: "mg", commonDosages: ["25", "50", "75", "100"] },
  { name: "Tramadol (Ultram)", category: "Pain Relief", defaultDosage: "50", defaultUnit: "mg", commonDosages: ["50", "100"] },

  { name: "Amoxicillin", category: "Antibiotic", defaultDosage: "500", defaultUnit: "mg", commonDosages: ["250", "500", "875"] },
  { name: "Amoxicillin/Clavulanate (Augmentin)", category: "Antibiotic", defaultDosage: "875", defaultUnit: "mg", commonDosages: ["250", "500", "875"] },
  { name: "Azithromycin (Z-Pack)", category: "Antibiotic", defaultDosage: "250", defaultUnit: "mg", commonDosages: ["250", "500"] },
  { name: "Ciprofloxacin (Cipro)", category: "Antibiotic", defaultDosage: "500", defaultUnit: "mg", commonDosages: ["250", "500", "750"] },
  { name: "Levofloxacin (Levaquin)", category: "Antibiotic", defaultDosage: "500", defaultUnit: "mg", commonDosages: ["250", "500", "750"] },
  { name: "Doxycycline", category: "Antibiotic", defaultDosage: "100", defaultUnit: "mg", commonDosages: ["50", "100", "200"] },
  { name: "Cephalexin (Keflex)", category: "Antibiotic", defaultDosage: "500", defaultUnit: "mg", commonDosages: ["250", "500"] },
  { name: "Metronidazole (Flagyl)", category: "Antibiotic", defaultDosage: "500", defaultUnit: "mg", commonDosages: ["250", "500"] },
  { name: "Sulfamethoxazole/Trimethoprim (Bactrim)", category: "Antibiotic", defaultDosage: "800", defaultUnit: "mg", commonDosages: ["400", "800"] },
  { name: "Clindamycin (Cleocin)", category: "Antibiotic", defaultDosage: "300", defaultUnit: "mg", commonDosages: ["150", "300", "450"] },
  { name: "Nitrofurantoin (Macrobid)", category: "Antibiotic", defaultDosage: "100", defaultUnit: "mg", commonDosages: ["50", "100"] },
  { name: "Penicillin V", category: "Antibiotic", defaultDosage: "500", defaultUnit: "mg", commonDosages: ["250", "500"] },

  { name: "Lisinopril (Zestril)", category: "ACE Inhibitor", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["2.5", "5", "10", "20", "40"] },
  { name: "Enalapril (Vasotec)", category: "ACE Inhibitor", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["2.5", "5", "10", "20"] },
  { name: "Losartan (Cozaar)", category: "ARB", defaultDosage: "50", defaultUnit: "mg", commonDosages: ["25", "50", "100"] },
  { name: "Valsartan (Diovan)", category: "ARB", defaultDosage: "80", defaultUnit: "mg", commonDosages: ["40", "80", "160", "320"] },
  { name: "Amlodipine (Norvasc)", category: "Calcium Channel Blocker", defaultDosage: "5", defaultUnit: "mg", commonDosages: ["2.5", "5", "10"] },
  { name: "Metoprolol (Lopressor)", category: "Beta Blocker", defaultDosage: "50", defaultUnit: "mg", commonDosages: ["25", "50", "100", "200"] },
  { name: "Atenolol (Tenormin)", category: "Beta Blocker", defaultDosage: "50", defaultUnit: "mg", commonDosages: ["25", "50", "100"] },
  { name: "Propranolol (Inderal)", category: "Beta Blocker", defaultDosage: "40", defaultUnit: "mg", commonDosages: ["10", "20", "40", "80"] },
  { name: "Carvedilol (Coreg)", category: "Beta Blocker", defaultDosage: "12.5", defaultUnit: "mg", commonDosages: ["3.125", "6.25", "12.5", "25"] },
  { name: "Hydrochlorothiazide (HCTZ)", category: "Diuretic", defaultDosage: "25", defaultUnit: "mg", commonDosages: ["12.5", "25", "50"] },
  { name: "Furosemide (Lasix)", category: "Diuretic", defaultDosage: "40", defaultUnit: "mg", commonDosages: ["20", "40", "80"] },
  { name: "Spironolactone (Aldactone)", category: "Diuretic", defaultDosage: "25", defaultUnit: "mg", commonDosages: ["25", "50", "100"] },
  { name: "Warfarin (Coumadin)", category: "Anticoagulant", defaultDosage: "5", defaultUnit: "mg", commonDosages: ["1", "2", "2.5", "5", "7.5", "10"] },
  { name: "Clopidogrel (Plavix)", category: "Antiplatelet", defaultDosage: "75", defaultUnit: "mg", commonDosages: ["75", "300"] },
  { name: "Digoxin (Lanoxin)", category: "Cardiac Glycoside", defaultDosage: "0.125", defaultUnit: "mg", commonDosages: ["0.0625", "0.125", "0.25"] },

  { name: "Atorvastatin (Lipitor)", category: "Statin", defaultDosage: "20", defaultUnit: "mg", commonDosages: ["10", "20", "40", "80"] },
  { name: "Rosuvastatin (Crestor)", category: "Statin", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["5", "10", "20", "40"] },
  { name: "Simvastatin (Zocor)", category: "Statin", defaultDosage: "20", defaultUnit: "mg", commonDosages: ["10", "20", "40"] },
  { name: "Pravastatin (Pravachol)", category: "Statin", defaultDosage: "40", defaultUnit: "mg", commonDosages: ["10", "20", "40", "80"] },

  { name: "Metformin (Glucophage)", category: "Antidiabetic", defaultDosage: "500", defaultUnit: "mg", commonDosages: ["500", "850", "1000"] },
  { name: "Glipizide (Glucotrol)", category: "Antidiabetic", defaultDosage: "5", defaultUnit: "mg", commonDosages: ["2.5", "5", "10"] },
  { name: "Glyburide (Diabeta)", category: "Antidiabetic", defaultDosage: "5", defaultUnit: "mg", commonDosages: ["1.25", "2.5", "5"] },
  { name: "Sitagliptin (Januvia)", category: "Antidiabetic", defaultDosage: "100", defaultUnit: "mg", commonDosages: ["25", "50", "100"] },
  { name: "Empagliflozin (Jardiance)", category: "Antidiabetic", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["10", "25"] },
  { name: "Insulin Glargine (Lantus)", category: "Insulin", defaultDosage: "10", defaultUnit: "unit(s)", commonDosages: ["10", "20", "30", "40"] },
  { name: "Insulin Lispro (Humalog)", category: "Insulin", defaultDosage: "5", defaultUnit: "unit(s)", commonDosages: ["2", "5", "10", "15", "20"] },

  { name: "Albuterol (ProAir/Ventolin)", category: "Bronchodilator", defaultDosage: "2", defaultUnit: "puff(s)", commonDosages: ["1", "2"] },
  { name: "Fluticasone (Flovent)", category: "Inhaled Corticosteroid", defaultDosage: "2", defaultUnit: "puff(s)", commonDosages: ["1", "2"] },
  { name: "Budesonide/Formoterol (Symbicort)", category: "Inhaled Combination", defaultDosage: "2", defaultUnit: "puff(s)", commonDosages: ["1", "2"] },
  { name: "Montelukast (Singulair)", category: "Leukotriene Inhibitor", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["4", "5", "10"] },
  { name: "Prednisone", category: "Corticosteroid", defaultDosage: "20", defaultUnit: "mg", commonDosages: ["5", "10", "20", "40", "60"] },
  { name: "Prednisolone", category: "Corticosteroid", defaultDosage: "15", defaultUnit: "mg", commonDosages: ["5", "10", "15", "20"] },
  { name: "Benzonatate (Tessalon)", category: "Antitussive", defaultDosage: "100", defaultUnit: "mg", commonDosages: ["100", "200"] },

  { name: "Omeprazole (Prilosec)", category: "Proton Pump Inhibitor", defaultDosage: "20", defaultUnit: "mg", commonDosages: ["10", "20", "40"] },
  { name: "Pantoprazole (Protonix)", category: "Proton Pump Inhibitor", defaultDosage: "40", defaultUnit: "mg", commonDosages: ["20", "40"] },
  { name: "Esomeprazole (Nexium)", category: "Proton Pump Inhibitor", defaultDosage: "20", defaultUnit: "mg", commonDosages: ["20", "40"] },
  { name: "Famotidine (Pepcid)", category: "H2 Blocker", defaultDosage: "20", defaultUnit: "mg", commonDosages: ["10", "20", "40"] },
  { name: "Ranitidine (Zantac)", category: "H2 Blocker", defaultDosage: "150", defaultUnit: "mg", commonDosages: ["75", "150", "300"] },
  { name: "Ondansetron (Zofran)", category: "Antiemetic", defaultDosage: "4", defaultUnit: "mg", commonDosages: ["4", "8"] },
  { name: "Promethazine (Phenergan)", category: "Antiemetic", defaultDosage: "25", defaultUnit: "mg", commonDosages: ["12.5", "25", "50"] },
  { name: "Dicyclomine (Bentyl)", category: "Antispasmodic", defaultDosage: "20", defaultUnit: "mg", commonDosages: ["10", "20"] },
  { name: "Loperamide (Imodium)", category: "Antidiarrheal", defaultDosage: "2", defaultUnit: "mg", commonDosages: ["2", "4"] },

  { name: "Sertraline (Zoloft)", category: "SSRI", defaultDosage: "50", defaultUnit: "mg", commonDosages: ["25", "50", "100", "150", "200"] },
  { name: "Escitalopram (Lexapro)", category: "SSRI", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["5", "10", "20"] },
  { name: "Fluoxetine (Prozac)", category: "SSRI", defaultDosage: "20", defaultUnit: "mg", commonDosages: ["10", "20", "40", "60"] },
  { name: "Citalopram (Celexa)", category: "SSRI", defaultDosage: "20", defaultUnit: "mg", commonDosages: ["10", "20", "40"] },
  { name: "Paroxetine (Paxil)", category: "SSRI", defaultDosage: "20", defaultUnit: "mg", commonDosages: ["10", "20", "30", "40"] },
  { name: "Venlafaxine (Effexor)", category: "SNRI", defaultDosage: "75", defaultUnit: "mg", commonDosages: ["37.5", "75", "150", "225"] },
  { name: "Duloxetine (Cymbalta)", category: "SNRI", defaultDosage: "30", defaultUnit: "mg", commonDosages: ["20", "30", "60"] },
  { name: "Bupropion (Wellbutrin)", category: "Antidepressant", defaultDosage: "150", defaultUnit: "mg", commonDosages: ["75", "100", "150", "300"] },
  { name: "Trazodone (Desyrel)", category: "Antidepressant", defaultDosage: "50", defaultUnit: "mg", commonDosages: ["25", "50", "100", "150"] },
  { name: "Mirtazapine (Remeron)", category: "Antidepressant", defaultDosage: "15", defaultUnit: "mg", commonDosages: ["7.5", "15", "30", "45"] },
  { name: "Buspirone (Buspar)", category: "Anxiolytic", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["5", "10", "15"] },
  { name: "Hydroxyzine (Vistaril)", category: "Anxiolytic", defaultDosage: "25", defaultUnit: "mg", commonDosages: ["10", "25", "50"] },
  { name: "Alprazolam (Xanax)", category: "Benzodiazepine", defaultDosage: "0.5", defaultUnit: "mg", commonDosages: ["0.25", "0.5", "1", "2"] },
  { name: "Lorazepam (Ativan)", category: "Benzodiazepine", defaultDosage: "1", defaultUnit: "mg", commonDosages: ["0.5", "1", "2"] },
  { name: "Clonazepam (Klonopin)", category: "Benzodiazepine", defaultDosage: "0.5", defaultUnit: "mg", commonDosages: ["0.25", "0.5", "1", "2"] },
  { name: "Diazepam (Valium)", category: "Benzodiazepine", defaultDosage: "5", defaultUnit: "mg", commonDosages: ["2", "5", "10"] },
  { name: "Aripiprazole (Abilify)", category: "Antipsychotic", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["2", "5", "10", "15", "20", "30"] },
  { name: "Quetiapine (Seroquel)", category: "Antipsychotic", defaultDosage: "100", defaultUnit: "mg", commonDosages: ["25", "50", "100", "200", "300"] },
  { name: "Risperidone (Risperdal)", category: "Antipsychotic", defaultDosage: "2", defaultUnit: "mg", commonDosages: ["0.5", "1", "2", "3", "4"] },
  { name: "Olanzapine (Zyprexa)", category: "Antipsychotic", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["2.5", "5", "10", "15", "20"] },
  { name: "Lithium (Lithobid)", category: "Mood Stabilizer", defaultDosage: "300", defaultUnit: "mg", commonDosages: ["150", "300", "450", "600"] },
  { name: "Lamotrigine (Lamictal)", category: "Mood Stabilizer / Anticonvulsant", defaultDosage: "100", defaultUnit: "mg", commonDosages: ["25", "50", "100", "150", "200"] },

  { name: "Zolpidem (Ambien)", category: "Sleep Aid", defaultDosage: "5", defaultUnit: "mg", commonDosages: ["5", "10"] },
  { name: "Melatonin", category: "Sleep Aid / Supplement", defaultDosage: "3", defaultUnit: "mg", commonDosages: ["1", "3", "5", "10"] },
  { name: "Diphenhydramine (Benadryl)", category: "Antihistamine / Sleep Aid", defaultDosage: "25", defaultUnit: "mg", commonDosages: ["25", "50"] },

  { name: "Cetirizine (Zyrtec)", category: "Antihistamine", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["5", "10"] },
  { name: "Loratadine (Claritin)", category: "Antihistamine", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["5", "10"] },
  { name: "Fexofenadine (Allegra)", category: "Antihistamine", defaultDosage: "180", defaultUnit: "mg", commonDosages: ["60", "180"] },
  { name: "Fluticasone Nasal (Flonase)", category: "Nasal Corticosteroid", defaultDosage: "2", defaultUnit: "puff(s)", commonDosages: ["1", "2"] },

  { name: "Levothyroxine (Synthroid)", category: "Thyroid", defaultDosage: "50", defaultUnit: "mcg", commonDosages: ["25", "50", "75", "88", "100", "112", "125", "150", "175", "200"] },
  { name: "Methimazole (Tapazole)", category: "Antithyroid", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["5", "10", "20"] },

  { name: "Cyclobenzaprine (Flexeril)", category: "Muscle Relaxant", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["5", "10"] },
  { name: "Baclofen", category: "Muscle Relaxant", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["5", "10", "20"] },
  { name: "Methocarbamol (Robaxin)", category: "Muscle Relaxant", defaultDosage: "750", defaultUnit: "mg", commonDosages: ["500", "750"] },
  { name: "Tizanidine (Zanaflex)", category: "Muscle Relaxant", defaultDosage: "4", defaultUnit: "mg", commonDosages: ["2", "4"] },

  { name: "Gabapentin (Neurontin)", category: "Anticonvulsant", defaultDosage: "300", defaultUnit: "mg", commonDosages: ["100", "300", "400", "600", "800"] },
  { name: "Pregabalin (Lyrica)", category: "Anticonvulsant", defaultDosage: "75", defaultUnit: "mg", commonDosages: ["25", "50", "75", "100", "150", "200", "300"] },
  { name: "Topiramate (Topamax)", category: "Anticonvulsant", defaultDosage: "50", defaultUnit: "mg", commonDosages: ["25", "50", "100", "200"] },
  { name: "Levetiracetam (Keppra)", category: "Anticonvulsant", defaultDosage: "500", defaultUnit: "mg", commonDosages: ["250", "500", "750", "1000"] },
  { name: "Carbamazepine (Tegretol)", category: "Anticonvulsant", defaultDosage: "200", defaultUnit: "mg", commonDosages: ["100", "200", "400"] },
  { name: "Sumatriptan (Imitrex)", category: "Migraine", defaultDosage: "50", defaultUnit: "mg", commonDosages: ["25", "50", "100"] },

  { name: "Latanoprost (Xalatan)", category: "Glaucoma", defaultDosage: "1", defaultUnit: "drop(s)", commonDosages: ["1"] },
  { name: "Timolol Eye Drops", category: "Glaucoma", defaultDosage: "1", defaultUnit: "drop(s)", commonDosages: ["1", "2"] },

  { name: "Vitamin D3", category: "Supplement", defaultDosage: "1000", defaultUnit: "IU", commonDosages: ["400", "1000", "2000", "5000", "50000"] },
  { name: "Vitamin B12", category: "Supplement", defaultDosage: "1000", defaultUnit: "mcg", commonDosages: ["500", "1000", "2500"] },
  { name: "Folic Acid", category: "Supplement", defaultDosage: "1", defaultUnit: "mg", commonDosages: ["0.4", "0.8", "1", "5"] },
  { name: "Iron (Ferrous Sulfate)", category: "Supplement", defaultDosage: "325", defaultUnit: "mg", commonDosages: ["65", "325"] },
  { name: "Calcium Carbonate", category: "Supplement", defaultDosage: "500", defaultUnit: "mg", commonDosages: ["500", "600", "1000", "1250"] },
  { name: "Potassium Chloride (K-Dur)", category: "Electrolyte", defaultDosage: "20", defaultUnit: "mEq", commonDosages: ["10", "20", "40"] },

  { name: "Triamcinolone Cream", category: "Topical Corticosteroid", defaultDosage: "0.1", defaultUnit: "%", commonDosages: ["0.025", "0.1", "0.5"] },
  { name: "Hydrocortisone Cream", category: "Topical Corticosteroid", defaultDosage: "1", defaultUnit: "%", commonDosages: ["0.5", "1", "2.5"] },
  { name: "Mupirocin (Bactroban)", category: "Topical Antibiotic", defaultDosage: "2", defaultUnit: "%", commonDosages: ["2"] },
  { name: "Ketoconazole Cream", category: "Topical Antifungal", defaultDosage: "2", defaultUnit: "%", commonDosages: ["2"] },

  { name: "Methylphenidate (Ritalin)", category: "Stimulant", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["5", "10", "20"] },
  { name: "Amphetamine/Dextroamphetamine (Adderall)", category: "Stimulant", defaultDosage: "10", defaultUnit: "mg", commonDosages: ["5", "10", "15", "20", "30"] },
  { name: "Lisdexamfetamine (Vyvanse)", category: "Stimulant", defaultDosage: "30", defaultUnit: "mg", commonDosages: ["10", "20", "30", "40", "50", "60", "70"] },
  { name: "Atomoxetine (Strattera)", category: "Non-Stimulant ADHD", defaultDosage: "40", defaultUnit: "mg", commonDosages: ["10", "18", "25", "40", "60", "80", "100"] },

  { name: "Alendronate (Fosamax)", category: "Bisphosphonate", defaultDosage: "70", defaultUnit: "mg", commonDosages: ["10", "35", "70"] },

  { name: "Allopurinol (Zyloprim)", category: "Gout", defaultDosage: "300", defaultUnit: "mg", commonDosages: ["100", "200", "300"] },
  { name: "Colchicine (Colcrys)", category: "Gout", defaultDosage: "0.6", defaultUnit: "mg", commonDosages: ["0.6"] },
];

export function searchMedications(query, limit = 10) {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase().trim();
  return MEDICATIONS
    .filter(m => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q))
    .slice(0, limit);
}

export function findMedication(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  return MEDICATIONS.find(m => m.name.toLowerCase() === lower) || null;
}

export function parseStoredDosage(dosageStr) {
  if (!dosageStr || !String(dosageStr).trim()) {
    return { amount: "", unit: "mg" };
  }
  const s = String(dosageStr).trim();
  const sorted = [...DOSAGE_UNITS].sort((a, b) => b.value.length - a.value.length);
  for (const { value } of sorted) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^\\s*([0-9]+\\.?[0-9]*)\\s*${escaped}\\s*$`, "i");
    const m = s.match(re);
    if (m) return { amount: m[1], unit: value };
  }
  const loose = s.match(/^([0-9]+\.?[0-9]*)\s*(.*)$/);
  if (loose) {
    const tail = loose[2].trim();
    const found = sorted.find(u => u.value.toLowerCase() === tail.toLowerCase());
    return { amount: loose[1], unit: found ? found.value : (tail || "mg") };
  }
  return { amount: s, unit: "mg" };
}
