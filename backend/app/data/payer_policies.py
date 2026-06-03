"""
Payer policy text chunks for seeding into pgvector.

Each entry represents one indexable policy chunk with metadata.
The 'content' field is what gets embedded and retrieved during gap analysis.
Embeddings are computed at seed time by app/ingestion/seed.py.

Three payers × one primary CPT each:
  bcbs_tx         + commercial       + 75571  (Coronary CTA)
  unitedhealthcare + commercial_hmo  + 75561  (Cardiac MRI)
  aetna           + commercial       + 75571  (Coronary CTA — same criteria, Aetna branding)
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PolicyChunkSeed:
    payer_id: str
    plan_type: str
    cpt_codes: list[str]
    icd10_codes: list[str]
    source_doc: str
    page_num: int
    chunk_index: int
    content: str
    metadata: dict = field(default_factory=dict)


POLICY_CHUNKS: list[PolicyChunkSeed] = [

    # -----------------------------------------------------------------------
    # BCBS TX — Commercial PPO — CPT 75571 (Coronary CTA)
    # -----------------------------------------------------------------------

    PolicyChunkSeed(
        payer_id="bcbs_tx",
        plan_type="commercial",
        cpt_codes=["75571"],
        icd10_codes=["I25.10", "I25.110", "I25.700", "I20.9", "R07.9"],
        source_doc="BCBS_TX_Medical_Policy_MP-1.019_Cardiac_Imaging_v2024.pdf",
        page_num=3,
        chunk_index=0,
        content=(
            "Prior authorization is required for CT angiography of the heart (CPT 75571) "
            "under all Blue Cross Blue Shield of Texas commercial PPO plans. The following "
            "criteria must be documented in the patient record prior to submission: "
            "(1) Cardiology evaluation within the past 12 months documenting symptoms "
            "consistent with coronary artery disease, including a formal cardiology "
            "consultation note signed by a board-eligible or board-certified cardiologist. "
            "(2) Imaging indication clearly stated by the ordering physician, including the "
            "specific clinical question to be answered and how the imaging result will change "
            "patient management. "
            "(3) Referring provider note on file documenting the basis for the referral and "
            "relevant clinical history. "
            "Requests missing any of the above criteria will be denied as administratively "
            "incomplete without clinical review."
        ),
        metadata={"section": "authorization_criteria", "effective_date": "2024-01-01"},
    ),

    PolicyChunkSeed(
        payer_id="bcbs_tx",
        plan_type="commercial",
        cpt_codes=["75571"],
        icd10_codes=["I25.10", "I25.110"],
        source_doc="BCBS_TX_Medical_Policy_MP-1.019_Cardiac_Imaging_v2024.pdf",
        page_num=4,
        chunk_index=1,
        content=(
            "BCBS TX Medical Policy MP-1.019 — Clinical Appropriateness for Coronary CTA:\n"
            "CT angiography of the coronary arteries is considered medically necessary when "
            "ALL of the following conditions are met:\n"
            "- Patient has symptoms suggestive of obstructive coronary artery disease "
            "(chest pain, exertional dyspnea, or equivalent anginal symptoms)\n"
            "- Patient has an intermediate pre-test probability of CAD based on age, sex, "
            "and symptom type (Duke Clinical Score or equivalent risk stratification)\n"
            "- Non-invasive stress testing is either contraindicated, inconclusive, or has "
            "not been performed due to documented clinical rationale\n"
            "- Cardiology or cardiovascular medicine specialist has evaluated the patient and "
            "documented the indication for advanced imaging\n\n"
            "Documentation requirements: The cardiology consultation note must be dated within "
            "12 months of the imaging order date and must include: patient history, physical "
            "examination findings, review of prior diagnostic testing, clinical impression, "
            "and explicit statement of imaging indication."
        ),
        metadata={"section": "clinical_appropriateness", "effective_date": "2024-01-01"},
    ),

    PolicyChunkSeed(
        payer_id="bcbs_tx",
        plan_type="commercial",
        cpt_codes=["75571"],
        icd10_codes=["I25.10"],
        source_doc="BCBS_TX_Medical_Policy_MP-1.019_Cardiac_Imaging_v2024.pdf",
        page_num=5,
        chunk_index=2,
        content=(
            "BCBS TX — Denial and Appeals Information for Cardiac Imaging (CPT 75571):\n"
            "Common denial reasons for coronary CTA prior authorization requests include:\n"
            "1. Missing cardiology consultation note — the most frequent administrative denial. "
            "A primary care referral note alone does not satisfy this requirement. A formal "
            "consultation note from a cardiologist is required.\n"
            "2. Insufficient documentation of symptom burden — vague or non-specific chest "
            "complaints without objective data are insufficient.\n"
            "3. Imaging indication statement absent or unclear — the ordering note must "
            "explicitly state the clinical question and management implications.\n\n"
            "Appeal rights: Members and providers may appeal denied prior authorization "
            "decisions within 60 days of the denial notice. Appeals must include the missing "
            "documentation or a clinical statement addressing the denial rationale."
        ),
        metadata={"section": "denial_appeals", "effective_date": "2024-01-01"},
    ),

    # -----------------------------------------------------------------------
    # United Healthcare — Commercial HMO — CPT 75561 (Cardiac MRI)
    # -----------------------------------------------------------------------

    PolicyChunkSeed(
        payer_id="unitedhealthcare",
        plan_type="commercial_hmo",
        cpt_codes=["75561", "75563"],
        icd10_codes=["I42.9", "I42.0", "I42.1", "I42.2", "I50.9"],
        source_doc="UHC_Coverage_Determination_Guideline_Cardiac_MRI_CDG.CRD.056.pdf",
        page_num=2,
        chunk_index=0,
        content=(
            "United Healthcare Coverage Determination Guideline — Cardiac MRI (CPT 75561, 75563):\n"
            "Cardiac MRI requires prior authorization under all UnitedHealthcare commercial "
            "HMO plans. Prior authorization must be obtained before the procedure is performed "
            "or coverage may be denied.\n\n"
            "Required documentation for prior authorization submission includes all of the following:\n"
            "(1) Physician note documenting suspected or confirmed cardiomyopathy or structural "
            "heart disease, including clinical findings, symptom description, and diagnosis "
            "supporting the need for cardiac MRI. The note must be from the ordering cardiologist.\n"
            "(2) Prior echocardiogram results within the past 6 months demonstrating findings "
            "that indicate cardiac MRI is needed for further characterization. An echocardiogram "
            "report with interpretation must be included in the submission.\n"
            "(3) Ordering cardiologist credentials on file — the ordering provider must be a "
            "board-eligible or board-certified cardiologist with active hospital privileges "
            "for advanced cardiac imaging orders."
        ),
        metadata={"section": "authorization_criteria", "effective_date": "2024-02-01"},
    ),

    PolicyChunkSeed(
        payer_id="unitedhealthcare",
        plan_type="commercial_hmo",
        cpt_codes=["75561"],
        icd10_codes=["I42.9"],
        source_doc="UHC_Coverage_Determination_Guideline_Cardiac_MRI_CDG.CRD.056.pdf",
        page_num=3,
        chunk_index=1,
        content=(
            "UHC Clinical Criteria — Cardiac MRI for Cardiomyopathy (I42.9):\n"
            "Cardiac MRI is considered medically necessary for evaluation of cardiomyopathy "
            "when the following clinical criteria are met:\n"
            "- Confirmed or suspected dilated, hypertrophic, restrictive, or arrhythmogenic "
            "cardiomyopathy based on clinical presentation or echocardiographic findings\n"
            "- Need for tissue characterization (fibrosis, edema, infiltration) via late "
            "gadolinium enhancement or T1/T2 mapping that cannot be adequately assessed "
            "by echocardiography or other modalities\n"
            "- Results of cardiac MRI will directly alter clinical management decisions, "
            "including device therapy (ICD/CRT-D), medication titration, or biopsy guidance\n\n"
            "Supporting documentation: Echocardiogram report must be submitted with the "
            "prior authorization request. The echo must have been performed within the "
            "preceding 6 months. Reports older than 6 months will not satisfy this requirement "
            "unless the treating cardiologist provides written justification."
        ),
        metadata={"section": "clinical_criteria_cardiomyopathy", "effective_date": "2024-02-01"},
    ),

    PolicyChunkSeed(
        payer_id="unitedhealthcare",
        plan_type="commercial_hmo",
        cpt_codes=["75561"],
        icd10_codes=["I42.9", "I50.9"],
        source_doc="UHC_Coverage_Determination_Guideline_Cardiac_MRI_CDG.CRD.056.pdf",
        page_num=4,
        chunk_index=2,
        content=(
            "UHC Cardiologist Credential Requirements for Cardiac MRI Orders:\n"
            "Under UnitedHealthcare HMO plans, cardiac MRI orders must be placed by a "
            "qualified cardiologist. The ordering provider must meet ALL of the following:\n"
            "- Board certification or board eligibility in Cardiovascular Disease through "
            "the American Board of Internal Medicine (ABIM) or equivalent certifying body\n"
            "- Active medical staff privileges at a facility equipped to perform and interpret "
            "cardiac MRI studies\n"
            "- NPI on file and verified in the UHC provider directory\n\n"
            "Primary care physicians may not place cardiac MRI orders under this policy "
            "without a cosigning cardiologist. Requests from non-cardiologists will be "
            "administratively denied and must be resubmitted with cardiologist attestation."
        ),
        metadata={"section": "provider_requirements", "effective_date": "2024-02-01"},
    ),

    # -----------------------------------------------------------------------
    # Aetna — Commercial PPO — CPT 75571 (Coronary CTA — same criteria, Aetna branding)
    # -----------------------------------------------------------------------

    PolicyChunkSeed(
        payer_id="aetna",
        plan_type="commercial",
        cpt_codes=["75571"],
        icd10_codes=["I25.10", "I25.110", "I20.9", "R07.9"],
        source_doc="Aetna_Clinical_Policy_Bulletin_CPB_0389_Cardiac_CT_v2024.pdf",
        page_num=2,
        chunk_index=0,
        content=(
            "Prior authorization is required for CT angiography of the heart (CPT 75571) "
            "under all Aetna commercial PPO plans. The following criteria must be documented "
            "in the patient record prior to submission: "
            "(1) Cardiology evaluation within the past 12 months documenting symptoms "
            "consistent with coronary artery disease, including a formal cardiology "
            "consultation note signed by a board-eligible or board-certified cardiologist. "
            "(2) Imaging indication clearly stated by the ordering physician, including the "
            "specific clinical question to be answered and how the imaging result will change "
            "patient management. "
            "(3) Referring provider note on file documenting the basis for the referral and "
            "relevant clinical history. "
            "Requests missing any of the above criteria will be denied as administratively "
            "incomplete without clinical review."
        ),
        metadata={"section": "authorization_criteria", "effective_date": "2024-03-01"},
    ),

    PolicyChunkSeed(
        payer_id="aetna",
        plan_type="commercial",
        cpt_codes=["75571"],
        icd10_codes=["I25.10"],
        source_doc="Aetna_Clinical_Policy_Bulletin_CPB_0389_Cardiac_CT_v2024.pdf",
        page_num=3,
        chunk_index=1,
        content=(
            "Aetna CPB 0389 — Clinical Appropriateness for Coronary CTA (CPT 75571):\n"
            "Cardiac CT angiography is considered medically necessary when ALL of the "
            "following conditions are met:\n"
            "- Symptoms suggestive of obstructive coronary artery disease (chest pain, "
            "exertional dyspnea, or equivalent anginal equivalent symptoms)\n"
            "- Intermediate pre-test probability of CAD based on clinical risk stratification\n"
            "- Formal cardiology or cardiovascular medicine specialist evaluation and "
            "documentation within the 12 months preceding the imaging order\n"
            "- Imaging indication explicitly documented with clinical rationale\n\n"
            "Note on code-diagnosis alignment: Coronary CTA (CPT 75571) is a cardiac imaging "
            "procedure and must be supported by a cardiac or coronary artery disease diagnosis "
            "code. Requests submitted with non-cardiac primary diagnosis codes will be flagged "
            "for clinical review and may be denied pending clarification of clinical indication."
        ),
        metadata={"section": "clinical_appropriateness", "effective_date": "2024-03-01"},
    ),

    PolicyChunkSeed(
        payer_id="aetna",
        plan_type="commercial",
        cpt_codes=["75571"],
        icd10_codes=["I25.10"],
        source_doc="Aetna_Clinical_Policy_Bulletin_CPB_0389_Cardiac_CT_v2024.pdf",
        page_num=4,
        chunk_index=2,
        content=(
            "Aetna Denial and Appeal Guidance — Cardiac CT (CPT 75571):\n"
            "Administrative denial reasons specific to cardiac CT prior authorization:\n"
            "1. Absent cardiology consultation — a referring PCP note does not substitute "
            "for a formal cardiology consultation. Appeals for this denial type must include "
            "the missing cardiology note or a letter of medical necessity from a cardiologist.\n"
            "2. Procedure-diagnosis mismatch — CPT 75571 (cardiac CT) submitted with a "
            "non-cardiac primary diagnosis code. Providers must ensure the primary ICD-10 "
            "code reflects the cardiac indication for imaging.\n"
            "3. Missing imaging indication — the ordering note must contain an explicit "
            "statement of the clinical question and expected management impact.\n\n"
            "Appeal deadline: 60 days from denial date under Aetna standard appeal process. "
            "Expedited appeals available for urgent clinical situations within 72 hours."
        ),
        metadata={"section": "denial_appeals", "effective_date": "2024-03-01"},
    ),
]


def get_chunks_for_payer(payer_id: str, plan_type: str) -> list[PolicyChunkSeed]:
    return [c for c in POLICY_CHUNKS if c.payer_id == payer_id and c.plan_type == plan_type]


def get_chunks_for_cpt(payer_id: str, plan_type: str, cpt_code: str) -> list[PolicyChunkSeed]:
    return [
        c for c in POLICY_CHUNKS
        if c.payer_id == payer_id
        and c.plan_type == plan_type
        and cpt_code in c.cpt_codes
    ]
