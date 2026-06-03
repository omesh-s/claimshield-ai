"""
Seed patient data — FHIR R4 structures and supporting chart artifacts.

Three demo patients, each representing a different prior auth scenario:
  10482736 — James Mitchell  — BCBS PPO  — CPT 75571 / I25.10  — Missing cardiology note
  20193847 — Sarah Chen      — UHC HMO   — CPT 75561 / I42.9   — Clean approval
  30571629 — Robert Torres   — Aetna PPO — CPT 75571 / J18.9   — CPT/ICD-10 mismatch
"""
from __future__ import annotations

from app.models.schemas import (
    PatientDemographics,
    OrderRequest,
    ChartArtifact,
)
from app.mocks.ehr import (
    FHIRPatient,
    FHIRServiceRequest,
    FHIRCoding,
    FHIRCodeableConcept,
    FHIRReference,
    FHIRAnnotation,
)

# ---------------------------------------------------------------------------
# CPT + ICD-10 display names
# ---------------------------------------------------------------------------

CPT_DISPLAYS = {
    "75571": "CT angiography, heart, coronary arteries (coronary CTA), with contrast material",
    "75561": "Cardiac MRI for morphology and function without and with contrast material",
}

ICD10_DISPLAYS = {
    "I25.10": "Atherosclerotic heart disease of native coronary artery without angina pectoris",
    "I42.9":  "Cardiomyopathy, unspecified",
    "J18.9":  "Pneumonia, unspecified organism",
}

# ---------------------------------------------------------------------------
# FHIR R4 Patient resources
# ---------------------------------------------------------------------------

FHIR_PATIENTS: dict[str, FHIRPatient] = {
    "10482736": FHIRPatient(
        id="10482736",
        name=[{"use": "official", "family": "Mitchell", "given": ["James", "Robert"]}],
        birthDate="1966-03-15",
        gender="male",
        identifier=[
            {"system": "http://hospital.claimshield.ai/patient", "value": "10482736"},
            {"system": "http://bcbstx.com/member", "value": "BCBS-PPO-7734521"},
        ],
    ),
    "20193847": FHIRPatient(
        id="20193847",
        name=[{"use": "official", "family": "Chen", "given": ["Sarah", "Lin"]}],
        birthDate="1979-07-22",
        gender="female",
        identifier=[
            {"system": "http://hospital.claimshield.ai/patient", "value": "20193847"},
            {"system": "http://uhc.com/member", "value": "UHC-HMO-4482019"},
        ],
    ),
    "30571629": FHIRPatient(
        id="30571629",
        name=[{"use": "official", "family": "Torres", "given": ["Robert", "A."]}],
        birthDate="1962-11-08",
        gender="male",
        identifier=[
            {"system": "http://hospital.claimshield.ai/patient", "value": "30571629"},
            {"system": "http://aetna.com/member", "value": "AETNA-PPO-9901344"},
        ],
    ),
}

# ---------------------------------------------------------------------------
# PatientDemographics (internal ClaimShield schema)
# ---------------------------------------------------------------------------

PATIENT_DEMOGRAPHICS: dict[str, PatientDemographics] = {
    "10482736": PatientDemographics(
        patient_id="10482736",
        first_name="James",
        last_name="Mitchell",
        date_of_birth="1966-03-15",
        gender="male",
        member_id="BCBS-PPO-7734521",
        group_number="GRP-44891",
    ),
    "20193847": PatientDemographics(
        patient_id="20193847",
        first_name="Sarah",
        last_name="Chen",
        date_of_birth="1979-07-22",
        gender="female",
        member_id="UHC-HMO-4482019",
        group_number="GRP-77203",
    ),
    "30571629": PatientDemographics(
        patient_id="30571629",
        first_name="Robert",
        last_name="Torres",
        date_of_birth="1962-11-08",
        gender="male",
        member_id="AETNA-PPO-9901344",
        group_number="GRP-55617",
    ),
}

# ---------------------------------------------------------------------------
# FHIR R4 ServiceRequest resources (one per demo case)
# ---------------------------------------------------------------------------

FHIR_SERVICE_REQUESTS: dict[str, FHIRServiceRequest] = {
    "ORD-2024-10482736-001": FHIRServiceRequest(
        id="ORD-2024-10482736-001",
        status="active",
        intent="order",
        subject=FHIRReference(reference="Patient/10482736", display="James Mitchell"),
        requester=FHIRReference(
            reference="Practitioner/1245319599",
            display="Dr. Patricia Hayes, MD",
        ),
        code=FHIRCodeableConcept(
            coding=[FHIRCoding(
                system="http://www.ama-assn.org/go/cpt",
                code="75571",
                display=CPT_DISPLAYS["75571"],
            )],
            text=CPT_DISPLAYS["75571"],
        ),
        reasonCode=[
            FHIRCodeableConcept(
                coding=[FHIRCoding(
                    system="http://hl7.org/fhir/sid/icd-10-cm",
                    code="I25.10",
                    display=ICD10_DISPLAYS["I25.10"],
                )],
                text=ICD10_DISPLAYS["I25.10"],
            )
        ],
        note=[
            FHIRAnnotation(
                text=(
                    "Patient presents with 3-month history of exertional chest discomfort. "
                    "Multiple cardiovascular risk factors. Coronary CTA indicated to evaluate "
                    "for significant CAD prior to further intervention planning."
                ),
                time="2024-11-04T09:15:00Z",
            )
        ],
        authoredOn="2024-11-04",
        insurance=[FHIRReference(reference="Coverage/BCBS-PPO-7734521")],
    ),
    "ORD-2024-20193847-001": FHIRServiceRequest(
        id="ORD-2024-20193847-001",
        status="active",
        intent="order",
        subject=FHIRReference(reference="Patient/20193847", display="Sarah Chen"),
        requester=FHIRReference(
            reference="Practitioner/1234567892",
            display="Dr. Michael Torres, MD, FACC",
        ),
        code=FHIRCodeableConcept(
            coding=[FHIRCoding(
                system="http://www.ama-assn.org/go/cpt",
                code="75561",
                display=CPT_DISPLAYS["75561"],
            )],
            text=CPT_DISPLAYS["75561"],
        ),
        reasonCode=[
            FHIRCodeableConcept(
                coding=[FHIRCoding(
                    system="http://hl7.org/fhir/sid/icd-10-cm",
                    code="I42.9",
                    display=ICD10_DISPLAYS["I42.9"],
                )],
                text=ICD10_DISPLAYS["I42.9"],
            )
        ],
        note=[
            FHIRAnnotation(
                text=(
                    "Cardiac MRI ordered for characterization of dilated cardiomyopathy. "
                    "Recent echo shows EF 35%. MRI will evaluate fibrosis via LGE and guide "
                    "decision on ICD placement."
                ),
                time="2024-11-05T10:30:00Z",
            )
        ],
        authoredOn="2024-11-05",
        insurance=[FHIRReference(reference="Coverage/UHC-HMO-4482019")],
    ),
    "ORD-2024-30571629-001": FHIRServiceRequest(
        id="ORD-2024-30571629-001",
        status="active",
        intent="order",
        subject=FHIRReference(reference="Patient/30571629", display="Robert Torres"),
        requester=FHIRReference(
            reference="Practitioner/1578901234",
            display="Dr. Angela Reyes, MD",
        ),
        code=FHIRCodeableConcept(
            coding=[FHIRCoding(
                system="http://www.ama-assn.org/go/cpt",
                code="75571",
                display=CPT_DISPLAYS["75571"],
            )],
            text=CPT_DISPLAYS["75571"],
        ),
        reasonCode=[
            FHIRCodeableConcept(
                coding=[FHIRCoding(
                    system="http://hl7.org/fhir/sid/icd-10-cm",
                    code="J18.9",
                    display=ICD10_DISPLAYS["J18.9"],
                )],
                text=ICD10_DISPLAYS["J18.9"],
            )
        ],
        note=[
            FHIRAnnotation(
                text=(
                    "Patient admitted for community-acquired pneumonia. "
                    "Responding to IV antibiotics. Follow-up in 5 days."
                ),
                time="2024-11-06T08:00:00Z",
            )
        ],
        authoredOn="2024-11-06",
        insurance=[FHIRReference(reference="Coverage/AETNA-PPO-9901344")],
    ),
}

# ---------------------------------------------------------------------------
# Ordering provider contact lines for appeal letter signatures (keyed by NPI)
# ---------------------------------------------------------------------------

ORDERING_PROVIDER_CONTACT: dict[str, dict[str, str]] = {
    "1245319599": {"specialty": "Internal Medicine", "phone": "555-0199"},
    "1234567892": {"specialty": "Cardiovascular Disease", "phone": "555-0102"},
    "1578901234": {"specialty": "Internal Medicine", "phone": "555-0104"},
}

# ---------------------------------------------------------------------------
# OrderRequest objects (ClaimShield internal schema)
# ---------------------------------------------------------------------------

ORDER_REQUESTS: dict[str, OrderRequest] = {
    "DEMO-001": OrderRequest(
        patient_id="10482736",
        payer_id="bcbs_tx",
        plan_type="commercial",
        cpt_code="75571",
        procedure_description="CT Angiography, Heart (Coronary CTA)",
        icd10_codes=["I25.10"],
        ordering_provider_npi="1245319599",
        ordering_provider_name="Dr. Patricia Hayes, MD",
        facility_npi="1902837465",
        clinical_notes=(
            "Patient James Mitchell, 58-year-old male, presents with a 3-month history of "
            "exertional chest discomfort and shortness of breath on moderate exertion. "
            "History significant for hypertension, hyperlipidemia, and 20-pack-year smoking "
            "history (quit 5 years ago). Resting ECG shows nonspecific ST-T wave changes in "
            "the lateral leads. Exercise tolerance has been progressively decreasing. "
            "IMAGING INDICATION: Coronary CTA ordered to evaluate for significant coronary "
            "artery stenosis in the setting of suspected CAD (I25.10). The indication is "
            "well-established given the symptom burden and cardiovascular risk profile. "
            "REFERRING PROVIDER NOTE: Referred by Dr. Patricia Hayes, MD, Internal Medicine. "
            "Patient referred for advanced cardiovascular imaging evaluation. Multiple "
            "cardiovascular risk factors present as documented above. "
            "NOTE: No cardiology consultation on file at this time. "
            "Patient declined cardiology referral at last visit."
        ),
        demo_case_id="DEMO-001",
    ),
    "DEMO-002": OrderRequest(
        patient_id="20193847",
        payer_id="unitedhealthcare",
        plan_type="commercial_hmo",
        cpt_code="75561",
        procedure_description="Cardiac MRI for Morphology and Function",
        icd10_codes=["I42.9"],
        ordering_provider_npi="1234567892",
        ordering_provider_name="Dr. Michael Torres, MD, FACC",
        facility_npi="1902837465",
        clinical_notes=(
            "Patient Sarah Chen, 45-year-old female, presents with progressive dyspnea on "
            "exertion over the past 4 months and bilateral lower extremity edema. "
            "PHYSICIAN NOTE — CARDIOMYOPATHY DOCUMENTATION: Recent workup reveals dilated "
            "cardiomyopathy (I42.9) with severely reduced left ventricular systolic function. "
            "Etiology remains under investigation; viral and ischemic causes being considered. "
            "ECHOCARDIOGRAM RESULTS (performed 2024-09-15, within 6 months): Dilated left "
            "ventricular cavity (LVEDD 6.8 cm). Severely reduced LVEF estimated at 35%. "
            "Mild mitral regurgitation. Mild tricuspid regurgitation. Dilated right ventricle "
            "with mildly reduced function. No significant pericardial effusion. "
            "IMPRESSION: Dilated cardiomyopathy with severely reduced LVEF requiring further "
            "characterization. "
            "ORDERING CARDIOLOGIST: Dr. Michael Torres, MD, FACC. Board Certified in "
            "Cardiovascular Disease and Advanced Heart Failure and Transplantation. "
            "NPI: 1234567892. Fellowship-trained at Cleveland Clinic. Active staff cardiologist "
            "at Regional Medical Center. "
            "Cardiac MRI (CPT 75561) ordered for morphologic characterization, fibrosis "
            "evaluation via late gadolinium enhancement, and functional assessment to guide "
            "potential ICD placement decision."
        ),
        demo_case_id="DEMO-002",
    ),
    "DEMO-003": OrderRequest(
        patient_id="30571629",
        payer_id="aetna",
        plan_type="commercial",
        cpt_code="75571",
        procedure_description="CT Angiography, Heart (Coronary CTA)",
        icd10_codes=["J18.9"],
        ordering_provider_npi="1578901234",
        ordering_provider_name="Dr. Angela Reyes, MD",
        facility_npi="1902837465",
        clinical_notes=(
            "Patient Robert Torres, 62-year-old male, admitted for community-acquired "
            "pneumonia. Presenting symptoms include fever (38.9°C), productive cough with "
            "purulent sputum, pleuritic chest pain, and right lower lobe consolidation on "
            "chest X-ray. WBC 14.2 with left shift. Sputum culture pending. "
            "Started on IV ceftriaxone and azithromycin per CAP protocol. "
            "Diagnosis: Pneumonia, unspecified organism (J18.9). "
            "Patient is responding to antibiotic therapy. Repeat CXR shows early improvement. "
            "Follow-up imaging in 5-7 days to confirm resolution."
        ),
        demo_case_id="DEMO-003",
    ),
}

# ---------------------------------------------------------------------------
# Chart artifacts (mock EHR chart pull per patient)
# ---------------------------------------------------------------------------

CHART_ARTIFACTS: dict[str, list[ChartArtifact]] = {
    # --- Patient 1: 2 present, 1 missing (cardiology consult absent) ---
    "10482736": [
        ChartArtifact(
            artifact_id="ART-10482736-001",
            artifact_type="progress_note",
            title="Imaging Indication & Ordering Physician Note",
            date="2024-11-04",
            provider="Dr. Patricia Hayes, MD — Internal Medicine",
            content=(
                "CLINICAL NOTE — IMAGING INDICATION\n"
                "Date: November 4, 2024\n"
                "Patient: James Mitchell | DOB: 03/15/1966 | MRN: 10482736\n\n"
                "Chief Complaint: Exertional chest discomfort × 3 months\n\n"
                "History of Present Illness: Mr. Mitchell is a 58-year-old male presenting "
                "with progressive exertional chest discomfort and shortness of breath on "
                "moderate exertion for approximately 3 months. He denies rest pain. Symptoms "
                "are reproducible with climbing two flights of stairs. He reports associated "
                "mild diaphoresis with exertion.\n\n"
                "Past Medical History: Hypertension (10 years), Hyperlipidemia (7 years)\n"
                "Social History: Former 20-pack-year smoker, quit 2019. Sedentary occupation.\n"
                "Medications: Lisinopril 10mg daily, Atorvastatin 40mg nightly, Aspirin 81mg\n\n"
                "Physical Examination:\n"
                "- BP: 138/86 mmHg  HR: 74 bpm  SpO2: 98% on room air\n"
                "- Cardiovascular: Regular rate and rhythm, no murmurs\n"
                "- Lungs: Clear to auscultation bilaterally\n\n"
                "Diagnostic Data:\n"
                "- Resting 12-lead ECG: Nonspecific ST-T wave changes in lateral leads (V4-V6)\n"
                "- Lipid panel (2024-08): LDL 142 mg/dL, HDL 38 mg/dL\n\n"
                "IMAGING INDICATION STATEMENT:\n"
                "CT angiography of the coronary arteries (CPT 75571) is ordered to evaluate "
                "for significant coronary artery stenosis in the context of suspected "
                "atherosclerotic coronary artery disease (ICD-10: I25.10). Imaging is "
                "clinically indicated given the patient's exertional symptom burden, "
                "significant cardiovascular risk profile, and ECG changes. Results will "
                "guide further management including potential stress testing or invasive "
                "coronary evaluation.\n\n"
                "Electronically signed: Dr. Patricia Hayes, MD | NPI: 1245319599"
            ),
            relevance_score=0.97,
        ),
        ChartArtifact(
            artifact_id="ART-10482736-002",
            artifact_type="progress_note",
            title="Referring Provider Note",
            date="2024-11-04",
            provider="Dr. Patricia Hayes, MD — Internal Medicine",
            content=(
                "REFERRING PROVIDER NOTE\n"
                "Date: November 4, 2024\n"
                "Patient: James Mitchell | DOB: 03/15/1966 | Member ID: BCBS-PPO-7734521\n\n"
                "To: Advanced Cardiovascular Imaging Department\n"
                "From: Dr. Patricia Hayes, MD, Internal Medicine | NPI: 1245319599\n"
                "Re: Referral for Coronary CT Angiography\n\n"
                "I am referring Mr. James Mitchell, a 58-year-old male patient, for advanced "
                "cardiovascular imaging evaluation. Mr. Mitchell has presented to my clinic "
                "with a 3-month history of exertional chest symptoms that are consistent with "
                "possible myocardial ischemia.\n\n"
                "Relevant Medical Background:\n"
                "- Hypertension, managed with Lisinopril\n"
                "- Hyperlipidemia, managed with Atorvastatin\n"
                "- Former smoker (20-pack-years, ceased 2019)\n"
                "- Resting ECG: nonspecific lateral ST-T changes\n"
                "- Framingham 10-year ASCVD risk: 22% (high)\n\n"
                "Requested Imaging: Coronary CTA (CPT 75571)\n"
                "Clinical Question: Is significant obstructive coronary artery disease "
                "present and contributing to patient's exertional symptoms?\n\n"
                "Insurance: Blue Cross Blue Shield TX Commercial PPO\n"
                "Group: GRP-44891 | Member: BCBS-PPO-7734521\n\n"
                "Please proceed with scheduling. Clinical urgency is moderate (non-emergent).\n\n"
                "Electronically signed: Dr. Patricia Hayes, MD | NPI: 1245319599\n"
                "Date: 11/04/2024"
            ),
            relevance_score=0.95,
        ),
        # Cardiology consultation is intentionally ABSENT for this patient.
        # This gap is what triggers the "missing criterion" in the gap analysis.
    ],

    # --- Patient 2: All 3 criteria present — clean approval ---
    "20193847": [
        ChartArtifact(
            artifact_id="ART-20193847-001",
            artifact_type="progress_note",
            title="Cardiology Note — Cardiomyopathy Documentation",
            date="2024-11-05",
            provider="Dr. Michael Torres, MD, FACC — Cardiology",
            content=(
                "CARDIOLOGY CLINIC NOTE\n"
                "Date: November 5, 2024\n"
                "Patient: Sarah Chen | DOB: 07/22/1979 | MRN: 20193847\n\n"
                "Chief Complaint: Progressive dyspnea on exertion and lower extremity edema\n\n"
                "Assessment & Plan:\n"
                "Diagnosis: Dilated Cardiomyopathy (ICD-10: I42.9) — newly diagnosed\n\n"
                "Patient is a 45-year-old female presenting with a 4-month history of "
                "progressive exertional dyspnea and bilateral ankle edema. Workup reveals "
                "dilated cardiomyopathy with severely depressed systolic function (EF 35%). "
                "Clinical presentation consistent with I42.9 — cardiomyopathy, unspecified. "
                "Etiology investigation ongoing (viral vs idiopathic vs peripartum).\n\n"
                "Current medications initiated: Carvedilol 3.125mg BID, Lisinopril 5mg daily, "
                "Furosemide 40mg daily, Spironolactone 25mg daily.\n\n"
                "CARDIAC MRI ORDERED (CPT 75561):\n"
                "Indications: (1) Morphologic characterization of dilated LV, "
                "(2) Late gadolinium enhancement (LGE) to assess for myocardial fibrosis and "
                "guide management, (3) Functional assessment to quantify true LVEF, "
                "(4) Evaluate for infiltrative or inflammatory etiology.\n"
                "Decision support: MRI results will directly guide ICD/CRT-D candidacy "
                "evaluation and optimize medical therapy titration.\n\n"
                "Electronically signed: Dr. Michael Torres, MD, FACC\n"
                "NPI: 1234567892 | Board Certified: Cardiovascular Disease, ABIM #MC-2209481"
            ),
            relevance_score=0.98,
        ),
        ChartArtifact(
            artifact_id="ART-20193847-002",
            artifact_type="imaging_report",
            title="Transthoracic Echocardiogram Report",
            date="2024-09-15",
            provider="Echo Lab — Regional Medical Center",
            content=(
                "TRANSTHORACIC ECHOCARDIOGRAM REPORT\n"
                "Date of Study: September 15, 2024  (within 6 months of MRI order)\n"
                "Patient: Sarah Chen | DOB: 07/22/1979 | MRN: 20193847\n"
                "Ordering Physician: Dr. Michael Torres, MD, FACC\n"
                "Indication: Evaluation of new-onset heart failure\n\n"
                "FINDINGS:\n"
                "Left Ventricle:\n"
                "  - LVEDD: 6.8 cm (severely dilated; normal <5.5 cm)\n"
                "  - LVESD: 5.9 cm\n"
                "  - Estimated LVEF: 35% (severely reduced; normal >55%)\n"
                "  - Wall motion: Global hypokinesis, no regional wall motion abnormality\n"
                "  - Wall thickness: Normal (septal 0.9 cm, posterior 0.8 cm)\n\n"
                "Valves:\n"
                "  - Mitral valve: Structurally normal; mild mitral regurgitation (Grade I/IV)\n"
                "  - Aortic valve: Trileaflet, no stenosis or regurgitation\n"
                "  - Tricuspid valve: Mild tricuspid regurgitation; RVSP estimated 38 mmHg\n\n"
                "Right Ventricle:\n"
                "  - Mildly dilated with mildly reduced systolic function; TAPSE 1.7 cm\n\n"
                "Pericardium: No pericardial effusion\n\n"
                "IMPRESSION:\n"
                "1. Severely dilated left ventricle with severely reduced systolic function "
                "(LVEF 35%). Findings consistent with dilated cardiomyopathy.\n"
                "2. Mild mitral and tricuspid regurgitation, likely secondary to ventricular dilation.\n"
                "3. Mildly reduced right ventricular function.\n"
                "Recommend cardiac MRI for further characterization and fibrosis mapping.\n\n"
                "Interpreting Physician: Dr. Janet Kim, MD — Echocardiography | NPI: 1098765432"
            ),
            relevance_score=0.99,
        ),
        ChartArtifact(
            artifact_id="ART-20193847-003",
            artifact_type="progress_note",
            title="Ordering Cardiologist Credentials on File",
            date="2024-11-05",
            provider="Credentialing Office — Regional Medical Center",
            content=(
                "PHYSICIAN CREDENTIALS ON FILE\n"
                "Physician: Dr. Michael Torres, MD, FACC\n"
                "NPI: 1234567892\n"
                "Specialty: Cardiovascular Disease / Advanced Heart Failure & Transplantation\n"
                "Board Certifications:\n"
                "  - American Board of Internal Medicine — Cardiovascular Disease (#MC-2209481)\n"
                "  - American Board of Internal Medicine — Advanced Heart Failure and "
                "Transplant Cardiology (#MC-2209482)\n"
                "Fellowship: Advanced Heart Failure, Cleveland Clinic (2008-2010)\n"
                "State License: Texas Medical License #TX-G-2209481 (active, expires 2026)\n"
                "DEA Registration: Active\n"
                "Hospital Privileges: Regional Medical Center — Active Staff, Cardiology\n"
                "FACC designation: Fellow of the American College of Cardiology\n"
                "Date of credentialing review: 2024-01-15 | Next review: 2026-01-15\n\n"
                "This document confirms active credentialing for advanced cardiovascular "
                "imaging orders including cardiac MRI (CPT 75561)."
            ),
            relevance_score=0.92,
        ),
    ],

    # --- Patient 3: Pneumonia notes present, but CPT is cardiac → mismatch ---
    "30571629": [
        ChartArtifact(
            artifact_id="ART-30571629-001",
            artifact_type="progress_note",
            title="Admitting Note — Community-Acquired Pneumonia",
            date="2024-11-06",
            provider="Dr. Angela Reyes, MD — Hospitalist",
            content=(
                "ADMITTING NOTE — INPATIENT\n"
                "Date: November 6, 2024\n"
                "Patient: Robert Torres | DOB: 11/08/1962 | MRN: 30571629\n"
                "Admitting Diagnosis: Community-Acquired Pneumonia (J18.9)\n\n"
                "Chief Complaint: Fever, productive cough, and shortness of breath × 4 days\n\n"
                "HPI: Mr. Torres is a 62-year-old male presenting with a 4-day history of "
                "progressive productive cough with yellow-green sputum, pleuritic right-sided "
                "chest pain, fever up to 38.9°C, and worsening dyspnea. No recent travel, "
                "sick contacts, or aspiration events. No cardiac symptoms reported.\n\n"
                "Vital Signs on Admission:\n"
                "  - Temp: 38.9°C  HR: 102 bpm  BP: 122/78 mmHg  RR: 22/min  SpO2: 92% RA\n\n"
                "Diagnostic Findings:\n"
                "  - CXR: Right lower lobe consolidation consistent with pneumonia\n"
                "  - WBC: 14,200 with left shift (bands 18%)\n"
                "  - CRP: 142 mg/L (elevated)\n"
                "  - Procalcitonin: 2.8 ng/mL (elevated — bacterial etiology likely)\n"
                "  - Sputum culture: Pending\n"
                "  - Blood cultures: × 2, pending\n\n"
                "Treatment Plan:\n"
                "  - IV Ceftriaxone 1g q24h\n"
                "  - Azithromycin 500mg IV q24h\n"
                "  - Supplemental O2 via nasal cannula at 2L/min\n"
                "  - Incentive spirometry\n"
                "  - DVT prophylaxis\n\n"
                "Assessment: Community-acquired pneumonia (J18.9). Clinical presentation and "
                "radiographic findings support bacterial etiology. PSI Class III.\n\n"
                "NOTE: Coronary CTA (CPT 75571) was erroneously entered on this order. "
                "No cardiac indication documented. Diagnosis code J18.9 is inconsistent with "
                "cardiac imaging procedure.\n\n"
                "Electronically signed: Dr. Angela Reyes, MD | NPI: 1578901234"
            ),
            relevance_score=0.88,
        ),
    ],
}

# ---------------------------------------------------------------------------
# Helper lookups
# ---------------------------------------------------------------------------

def get_order_for_demo(demo_case_id: str) -> OrderRequest | None:
    return ORDER_REQUESTS.get(demo_case_id)


def get_chart_artifacts(patient_id: str) -> list[ChartArtifact]:
    return CHART_ARTIFACTS.get(patient_id, [])


def get_patient_demographics(patient_id: str) -> PatientDemographics | None:
    return PATIENT_DEMOGRAPHICS.get(patient_id)
