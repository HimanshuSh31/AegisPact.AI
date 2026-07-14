import io
from datetime import datetime
from typing import List, Dict, Any

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# Colors
PRIMARY_COLOR = colors.HexColor("#312e81")  # Deep Indigo
TEXT_DARK = colors.HexColor("#1e293b")      # Slate 800
TEXT_MUTED = colors.HexColor("#64748b")     # Slate 500
BORDER_COLOR = colors.HexColor("#e2e8f0")   # Slate 200

VERDICT_COLORS = {
    "COMPLIANT": colors.HexColor("#d1fae5"),      # emerald 100
    "NON_COMPLIANT": colors.HexColor("#ffe4e6"),  # rose 100
    "NEEDS_REVIEW": colors.HexColor("#fef3c7"),   # amber 100
    "NOT_APPLICABLE": colors.HexColor("#f1f5f9")  # slate 100
}

VERDICT_TEXT_COLORS = {
    "COMPLIANT": colors.HexColor("#065f46"),
    "NON_COMPLIANT": colors.HexColor("#991b1b"),
    "NEEDS_REVIEW": colors.HexColor("#92400e"),
    "NOT_APPLICABLE": colors.HexColor("#334155")
}

class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and draw "Page X of Y" page numbers.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_decorations(self, page_count):
        self.saveState()
        
        # Draw header on all pages except the first one
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(PRIMARY_COLOR)
            self.drawString(54, letter[1] - 40, "AEGISPACT.AI COMPLIANCE REPORT")
            self.setStrokeColor(BORDER_COLOR)
            self.setLineWidth(0.5)
            self.line(54, letter[1] - 45, letter[0] - 54, letter[1] - 45)

        # Draw footer on all pages
        self.setFont("Helvetica", 9)
        self.setFillColor(TEXT_MUTED)
        self.drawString(54, 36, "CONFIDENTIAL — FOR INTERNAL USE ONLY")
        self.drawRightString(letter[0] - 54, 36, f"Page {self._pageNumber} of {page_count}")
        self.setStrokeColor(BORDER_COLOR)
        self.setLineWidth(0.5)
        self.line(54, 48, letter[0] - 54, 48)
        
        self.restoreState()


def generate_compliance_pdf(
    job: Any,
    doc_name: str,
    framework_name: str,
    findings: List[Dict[str, Any]],
    auditor_name: str
) -> bytes:
    """
    Compiles the compliance scorecard into a premium, styled PDF file buffer.
    """
    buffer = io.BytesIO()
    
    # Setup document
    pdf_doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=60
    )

    styles = getSampleStyleSheet()
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=PRIMARY_COLOR,
        spaceAfter=6
    )
    
    subtitle_style = ParagraphStyle(
        "DocSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=12,
        leading=16,
        textColor=TEXT_MUTED,
        spaceAfter=25
    )
    
    h1_style = ParagraphStyle(
        "SectionH1",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=PRIMARY_COLOR,
        spaceBefore=15,
        spaceAfter=10,
        keepWithNext=True
    )
    
    meta_label_style = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14,
        textColor=TEXT_DARK
    )
    
    meta_val_style = ParagraphStyle(
        "MetaValue",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=TEXT_DARK
    )
    
    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=TEXT_DARK
    )
    
    code_style = ParagraphStyle(
        "ReportCode",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569"),
        leftIndent=15,
        spaceAfter=5
    )

    story = []

    # 1. Header Banner
    story.append(Paragraph("AegisPact.AI Compliance Report", title_style))
    story.append(Paragraph(f"Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", subtitle_style))
    story.append(Spacer(1, 10))

    # 2. Metadata Table
    meta_data = [
        [Paragraph("Document Name:", meta_label_style), Paragraph(doc_name, meta_val_style),
         Paragraph("Compliance Score:", meta_label_style), Paragraph(f"{job.score:.1f}%", ParagraphStyle("ScoreVal", parent=meta_label_style, fontSize=12, textColor=colors.HexColor("#056346") if job.score >= 80 else colors.HexColor("#b91c1c")))],
        [Paragraph("Framework:", meta_label_style), Paragraph(framework_name, meta_val_style),
         Paragraph("Auditor Profile:", meta_label_style), Paragraph(auditor_name, meta_val_style)],
        [Paragraph("Job Identifier:", meta_label_style), Paragraph(f"#{job.id}", meta_val_style),
         Paragraph("Status:", meta_label_style), Paragraph(job.status.value, meta_val_style)]
    ]
    meta_table = Table(meta_data, colWidths=[110, 150, 110, 134])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LINEBELOW', (0,0), (-1,-1), 0.5, BORDER_COLOR),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 20))

    # 3. Ragas MLOps Quality Card
    if job.eval_result or (hasattr(job, 'ragas_faithfulness') and job.ragas_faithfulness is not None):
        story.append(Paragraph("MLOps Ragas Quality scorecards", h1_style))
        faithfulness = getattr(job, 'ragas_faithfulness', None) or job.eval_result.get("faithfulness", 0.0)
        relevance = getattr(job, 'ragas_relevance', None) or job.eval_result.get("answer_relevance", 0.0)
        recall = getattr(job, 'ragas_recall', None) or job.eval_result.get("context_recall", 0.0)
        
        ragas_data = [
            [Paragraph("Quality Metric", meta_label_style), Paragraph("Score", meta_label_style), Paragraph("Benchmark Description", meta_label_style)],
            [Paragraph("Faithfulness", body_style), Paragraph(f"{faithfulness*100:.0f}%", body_style), Paragraph("Measures whether LLM compliance reasoning was strictly grounded in contract text.", body_style)],
            [Paragraph("Answer Relevance", body_style), Paragraph(f"{relevance*100:.0f}%", body_style), Paragraph("Ensures the generated explanation directly addresses the policy control.", body_style)],
            [Paragraph("Context Recall", body_style), Paragraph(f"{recall*100:.0f}%", body_style), Paragraph("Validates whether RAG successfully retrieved the relevant clauses from the PDF.", body_style)]
        ]
        ragas_table = Table(ragas_data, colWidths=[120, 60, 324])
        ragas_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f8fafc")),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ]))
        story.append(ragas_table)
        story.append(Spacer(1, 20))

    # 4. Findings List Header
    story.append(Paragraph("Compliance Findings Details", h1_style))

    # Group findings
    compliant_findings = [f for f in findings if f["verdict"] == "COMPLIANT"]
    non_compliant_findings = [f for f in findings if f["verdict"] == "NON_COMPLIANT"]
    review_findings = [f for f in findings if f["verdict"] == "NEEDS_REVIEW"]
    na_findings = [f for f in findings if f["verdict"] == "NOT_APPLICABLE"]

    ordered_findings = non_compliant_findings + review_findings + compliant_findings + na_findings

    for idx, f in enumerate(ordered_findings):
        verdict = f["verdict"]
        bg_col = VERDICT_COLORS.get(verdict, colors.HexColor("#ffffff"))
        txt_col = VERDICT_TEXT_COLORS.get(verdict, colors.black)
        
        # Build block
        finding_elements = []
        
        # Title bar table
        verdict_badge_style = ParagraphStyle(
            "BadgeStyle",
            parent=meta_label_style,
            textColor=txt_col,
            fontSize=9
        )
        
        title_bar_data = [
            [
                Paragraph(f"Rule: {f['rule_id']}", meta_label_style),
                Paragraph(f["rule_title"], meta_val_style),
                Paragraph(verdict, verdict_badge_style)
            ]
        ]
        title_table = Table(title_bar_data, colWidths=[110, 294, 100])
        title_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), bg_col),
            ('ALIGN', (2,0), (2,0), 'RIGHT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ]))
        finding_elements.append(title_table)
        finding_elements.append(Spacer(1, 6))

        # Citations and Reasonings
        if f.get("clause_text"):
            page_text = f" (Page {f['page_number']})" if f.get("page_number") else ""
            finding_elements.append(Paragraph(f"<b>Verbatim Citation{page_text}:</b>", ParagraphStyle("CiteTitle", parent=body_style, fontSize=9, textColor=TEXT_MUTED)))
            finding_elements.append(Paragraph(f'"{f["clause_text"]}"', code_style))
            
        finding_elements.append(Paragraph("<b>Compliance Analysis:</b>", ParagraphStyle("AnalTitle", parent=body_style, fontSize=9, textColor=TEXT_MUTED)))
        finding_elements.append(Paragraph(f["explanation"], ParagraphStyle("ExplanationText", parent=body_style, leftIndent=10)))
        
        # Human Override details if applicable
        if f.get("is_overridden"):
            override_style = ParagraphStyle(
                "OverrideStyle",
                parent=body_style,
                fontSize=9,
                textColor=colors.HexColor("#7c2d12"),
                backColor=colors.HexColor("#ffedd5"),
                borderColor=colors.HexColor("#fed7aa"),
                borderWidth=0.5,
                borderPadding=6,
                spaceBefore=5
            )
            finding_elements.append(Paragraph(f"⚠️ <b>Human Auditor Override Note:</b> Verdict manually updated to <b>{f['overridden_status']}</b>. Justification: {f['overridden_explanation']}", override_style))

        finding_elements.append(Spacer(1, 15))
        story.append(KeepTogether(finding_elements))

    # Build the document
    pdf_doc.build(story, canvasmaker=NumberedCanvas)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
