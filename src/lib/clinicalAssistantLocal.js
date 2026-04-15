/**
 * Clinical / health education replies for doctors and patients.
 * Returns the same shape as chat/completions for the UI.
 */

function lastUserContent(messages) {
  const users = messages.filter((m) => m.role === "user");
  return (users[users.length - 1]?.content || "").trim();
}

function lastAssistantContent(messages) {
  const assistants = messages.filter((m) => m.role === "assistant");
  return (assistants[assistants.length - 1]?.content || "").trim();
}

function systemContext(messages) {
  const sys = messages.find((m) => m.role === "system");
  return sys?.content || "";
}

/** One short line so we don’t paste the whole system prompt into the chat. */
function sessionHint(systemText) {
  if (!systemText || systemText.length < 40) return "";
  const m = systemText.match(/Dr\.\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/);
  const name = m ? m[1].trim() : "";
  const appt = /(\d+)\s+appointments?\s+today/i.exec(systemText);
  const pts = /(\d+)\s+patients?/i.exec(systemText);
  const bits = [];
  if (name) bits.push(`you’re working with Dr. ${name}`);
  if (pts) bits.push(`${pts[1]} patient${pts[1] === "1" ? "" : "s"} on your panel`);
  if (appt) bits.push(`${appt[1]} appointment${appt[1] === "1" ? "" : "s"} today`);
  if (!bits.length) return "";
  return `(${bits.join("; ")}—I'll keep that in mind for follow-ups.)`;
}

const FOOT =
  "\n\n*(General education only—not a diagnosis or plan. Use your judgment and loop in pharmacy when it matters.)*";

const FOOT_PATIENT =
  "\n\n*(General info only—not a substitute for your care team. If something might be urgent, use emergency services.)*";

function isSerotoninEducationQuery(q) {
  if (
    /serotonin syndrome|serotonergic syndrome|serotonin toxicity|serotonin storm|hunter criteria|ocular clonus/i.test(q)
  ) {
    return true;
  }
  if (/^signs of serotonin|^symptoms of serotonin|^what is serotonin syndrome/i.test(q.trim())) {
    return true;
  }
  if (
    /serotonin|serotonergic|ssri|snri|maoi|tramadol|linezolid|mirtazapine|triptan/i.test(q) &&
    /sign|symptom|clonus|hyperreflexia|differentiat|versus|vs\.? |how to tell|recogni|criteria|toxicity|syndrome/i.test(q)
  ) {
    return true;
  }
  return false;
}

function replyDoctor(userText, systemText, messages = []) {
  const q = userText.toLowerCase();
  const priorAssistant = lastAssistantContent(messages).toLowerCase();

  if (isSerotoninEducationQuery(q)) {
    return (
      "Serotonin syndrome is a spectrum of excess serotonergic activity—often described as a triad of altered mental status (agitation, confusion), autonomic instability (fever, sweating, tachycardia, blood pressure changes, dilated pupils), and neuromuscular hyperactivity (tremor, hyperreflexia, clonus; ocular clonus is a useful clue when present).\n\n" +
      "You’re also weighing overlap with infection, anticholinergic toxicity, sympathomimetic excess, alcohol or benzodiazepine withdrawal, and neuroleptic malignant syndrome (often more bradykinesia or lead-pipe rigidity with less clonus). The medication story matters: combinations of serotonergic drugs (for example SSRI with MAOI, linezolid, or certain triptans), tramadol, recent dose changes, and timing.\n\n" +
      "If the patient is unstable, that’s an in-person or emergency pathway per your protocols; once they’re safe, document the exam (especially clonus and reflexes), the med list, and what you’ve ruled out." +
      FOOT
    );
  }

  if (
    priorAssistant &&
    /serotonin|clonus|hyperreflexia|serotonergic/i.test(priorAssistant) &&
    /hand|hands|finger|wrist|pain|ache|hurt|numb|tingling|stiff/i.test(q)
  ) {
    return (
      "Isolated hand pain isn’t a classic “smoking gun” for serotonin syndrome—what you’re more often looking for on exam is tremor, hyperreflexia, and inducible clonus (including ocular clonus), sometimes with muscle rigidity, agitation, and autonomic signs.\n\n" +
      "If the complaint is focal hand pain, think through the usual musculoskeletal and neuropathic differentials too (overuse, arthritis flare, carpal tunnel, cervical radiculopathy), and tie it back to timing with med changes and the rest of the vitals and neuro exam. If something doesn’t fit or the patient looks toxic, escalate per your usual pathways." +
      FOOT
    );
  }

  // Don’t treat “serotonin” alone as generic emergency—use the block above for education.
  if (/neuroleptic malignant|stroke|chest pain|can't breathe|suicid|overdose|anaphylaxis|911|emergency/.test(q)) {
    return (
      "If you’re seeing possible emergency symptoms—chest pain, trouble breathing, stroke signs, a severe allergic reaction, new confusion, or thoughts of self-harm—the right step is immediate in-person or emergency care (for example 911 in the U.S.). I can’t triage or replace that assessment.\n\n" +
      "Once the patient is safe, document what you observed, what you advised, and follow your local protocols." +
      FOOT
    );
  }

  if (/interaction|interact|contraindicat|combine|together with/.test(q)) {
    return (
      "When you’re thinking about interactions, it helps to have the full picture: every prescription, over-the-counter drug, supplement, and relevant organ function (especially kidney and liver). Interactions aren’t just “yes/no”—they depend on dose, duration, and the patient’s comorbidities.\n\n" +
      "A pharmacist can often add the most practical layer here (formulation, timing, renal adjustment, and interaction checkers that match your full list). For teaching or documentation, note the specific drugs and classes involved and what you’d monitor if you co-prescribe.\n\n" +
      "If you tell me two drug names from the same patient’s list, I can walk through the general clinical considerations—not patient-specific dosing." +
      FOOT
    );
  }

  if (/dose|dosing|how much|titrat|mg|mcg|units/.test(q)) {
    return (
      "Good dosing questions usually start from the label, the patient’s renal/hepatic function, age, weight (when it matters), and what’s already been tried. Changes should follow the prescriber’s plan or a structured titration protocol—not ad hoc adjustments from a chat.\n\n" +
      "For teaching points: highlight what you’d check before increasing a dose (symptoms, labs, adherence, interactions) and what you’d tell the patient to watch for. Your pharmacist colleagues are especially helpful for formulation, titration schedules, and practical counseling." +
      FOOT
    );
  }

  if (/hypertension|blood pressure|bp |hba1c|diabetes|heart failure|copd|guideline/.test(q)) {
    return (
      "Guidelines are a starting framework; the art is applying them to the person in front of you—comorbidities, frailty, preferences, and access all matter. Name the society guideline and approximate year when you teach or chart (e.g. ACC/AHA, ADA, GOLD), and note where your patient doesn’t fit the “average” trial population.\n\n" +
      "A useful habit: state the goal (e.g. BP or A1c target), what you’ve already optimized, and what you’d try next if goals aren’t met, including when to loop in cardiology, nephrology, or endocrine." +
      FOOT
    );
  }

  if (/refer|referral|cardiology|nephrology|specialist/.test(q)) {
    return (
      "Referrals go more smoothly when the receiving team knows why the patient is coming, what’s been done already, and what question you need answered. In the note: concise history, relevant meds, key labs or imaging, and your specific clinical question.\n\n" +
      "Red-flag symptoms, unclear diagnosis despite reasonable workup, or need for a procedure or disease-specific therapy are common reasons to refer. Same-day or urgent pathways depend on your system—use those when the story doesn’t fit routine follow-up." +
      FOOT
    );
  }

  if (/pharmacist|pharmacy|counsel|otc|over-the-counter|dispens|prior auth/.test(q)) {
    return (
      "Pharmacists are central for making regimens workable: formulation, timing with food, renal/hepatic adjustment, OTC overlap, affordability, and patient counseling. When you’re unsure about a substitution, prior authorization, or an interaction, a quick conversation with pharmacy often saves everyone time.\n\n" +
      "For patients: encourage them to use one pharmacy when possible and to bring an up-to-date med list to every visit." +
      FOOT
    );
  }

  const hint = sessionHint(systemText);
  return (
    "Hey—what are you trying to figure out? Give me the situation in a sentence or two (and drug names if relevant). I’m happy to talk through interactions, monitoring, titration, referrals, or how to make the plan workable with pharmacy. " +
    (hint ? `${hint} ` : "") +
    FOOT
  );
}

function replyPatient(userText, healthContext) {
  const q = userText.toLowerCase();
  const ctx = healthContext.toLowerCase();

  if (/911|emergency|chest pain|can't breathe|stroke|suicid|severe bleed|anaphylaxis/.test(q)) {
    return (
      "If you might be having an emergency—trouble breathing, chest pain, signs of stroke, heavy bleeding, or thoughts of hurting yourself—please call your local emergency number right away or go to the nearest emergency department. I’m not able to tell how urgent your situation is from a message.\n\n" +
      "If you’re safe right now but still worried, that’s something to bring to your doctor or nurse line as soon as you can." +
      FOOT_PATIENT
    );
  }

  if (/interaction|with my med|take with|mix with/.test(q)) {
    return (
      "The safest way to check interactions is with your full list—every prescription, over-the-counter medicine, and supplement—in front of a pharmacist or doctor who knows you. They can see the whole picture and your kidney function, allergies, and other conditions.\n\n" +
      "In general: don’t start or stop prescription medicines without your clinician; read OTC labels carefully; and mention herbals and vitamins too—they count.\n" +
      (ctx.includes("allerg") ? "\nYour profile lists allergies—make sure every new prescriber and pharmacist sees that list.\n" : "") +
      FOOT_PATIENT
    );
  }

  if (/adherence|remember|schedule|miss a dose|forget/.test(q)) {
    return (
      "Sticking to a schedule gets easier when doses line up with things you already do every day—breakfast, brushing teeth, bedtime. Pill organizers and phone reminders (including the ones in MedTrack) help a lot of people.\n\n" +
      "If you miss a dose, what to do next depends on the specific drug—your pharmacist can give you a simple rule for that medication so you’re not guessing." +
      FOOT_PATIENT
    );
  }

  if (/side effect|feel sick|nausea|rash|dizzy/.test(q)) {
    return (
      "New symptoms that start after a medicine change are worth mentioning to your prescriber or pharmacist—especially if they’re getting worse or affecting daily life. They can tell you whether to continue the drug, adjust the dose, or be seen in person.\n\n" +
      "Seek urgent care or emergency care for trouble breathing, swelling of the face or lips, a widespread rash with fever, or chest pain." +
      FOOT_PATIENT
    );
  }

  return (
    "Hi. I can help with meds, routines, side effects, and when to get care. What do you want help with?\n\n" +
    FOOT_PATIENT
  );
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {'doctor'|'patient'} mode
 */
export function buildLocalAssistantReply(messages, mode = "doctor") {
  const userText = lastUserContent(messages);
  const sys = systemContext(messages);
  let content;
  if (mode === "patient") {
    content = replyPatient(userText, sys);
  } else {
    content = replyDoctor(userText, sys, messages);
  }

  return {
    choices: [{ message: { content } }],
  };
}
