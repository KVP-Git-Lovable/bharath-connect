#!/usr/bin/env python3
"""
SBEE Cables - Weekly Executive Report Generator
Generates a professional PDF report using ReportLab
"""

from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from datetime import datetime, timedelta

# Sample data
LEADS_DATA = [
    ("Nagananda Beegamudre", "ABC Corporation", "In Progress", "₹2.5Cr", "13 Aug 2026"),
    ("Ayush Kumar", "XYZ Industries", "Qualified", "₹1.8Cr", "12 Aug 2026"),
    ("Manoj Singh", "Tech Solutions Ltd", "Proposal", "₹3.2Cr", "11 Aug 2026"),
    ("Ramesh Patel", "Global Enterprises", "Negotiation", "₹2.1Cr", "10 Aug 2026"),
    ("Priya Sharma", "Innovation Hub", "In Progress", "₹1.5Cr", "09 Aug 2026"),
    ("Vikram Reddy", "Future Corp", "Qualified", "₹2.8Cr", "08 Aug 2026"),
    ("Pooja Desai", "Enterprise Solutions", "Proposal", "₹1.9Cr", "07 Aug 2026"),
    ("Arjun Nair", "Digital Ventures", "In Progress", "₹2.3Cr", "06 Aug 2026"),
    ("Sneha Gupta", "Tech Innovation", "Qualified", "₹1.6Cr", "05 Aug 2026"),
    ("Rohan Verma", "Growth Partners", "Negotiation", "₹2.7Cr", "04 Aug 2026"),
]

ACTIVITIES_DATA = [
    ("Prospecting", "45"),
    ("Customer Meeting", "38"),
    ("Phone Call", "62"),
    ("Email Follow-up", "54"),
    ("Internal Discussion", "29"),
    ("Negotiation", "18"),
]

USERS_PERFORMANCE = [
    ("Nagananda Beegamudre", "8", "12", "₹8.5Cr"),
    ("Ayush Kumar", "6", "10", "₹6.2Cr"),
    ("Manoj Singh", "7", "11", "₹7.8Cr"),
    ("Ramesh Patel", "5", "9", "₹5.1Cr"),
    ("Priya Sharma", "9", "14", "₹9.2Cr"),
    ("Vikram Reddy", "6", "8", "₹6.8Cr"),
    ("Pooja Desai", "7", "10", "₹7.1Cr"),
    ("Arjun Nair", "8", "12", "₹8.3Cr"),
]

def generate_report():
    """Generate the SBEE Cables Weekly Report PDF"""

    filename = f"SBEE_Weekly_Report_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.pdf"
    doc = SimpleDocTemplate(
        filename,
        pagesize=landscape(letter),
        rightMargin=20,
        leftMargin=20,
        topMargin=20,
        bottomMargin=20,
    )

    # Container for PDF elements
    elements = []

    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=28,
        textColor=colors.HexColor('#DC2626'),
        spaceAfter=6,
        fontName='Helvetica-Bold',
        alignment=TA_LEFT
    )

    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#666666'),
        spaceAfter=2,
        fontName='Helvetica'
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=13,
        textColor=colors.HexColor('#141E3C'),
        spaceAfter=8,
        fontName='Helvetica-Bold',
        spaceBefore=10
    )

    # Header
    title = Paragraph("SBEE CABLES INDIA LTD", title_style)
    elements.append(title)

    subtitle = Paragraph("Weekly Executive Report", subtitle_style)
    elements.append(subtitle)

    # Date range
    today = datetime.now()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    date_str = f"Report Period: {week_start.strftime('%d %b %Y')} - {week_end.strftime('%d %b %Y')}"
    date_para = Paragraph(date_str, subtitle_style)
    elements.append(date_para)
    elements.append(Spacer(1, 12))

    # Key Metrics Section
    elements.append(Paragraph("📊 KEY PERFORMANCE INDICATORS", heading_style))

    kpi_data = [
        ["Total Leads", "68"],
        ["Pipeline Value", "₹45.2Cr"],
        ["Active Users", "8"],
        ["Activities This Week", "246"],
        ["Completion Rate", "84%"],
    ]

    kpi_table = Table(kpi_data, colWidths=[3.5*inch, 2*inch])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F3F4F6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#141E3C')),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
    ]))
    elements.append(kpi_table)
    elements.append(Spacer(1, 15))

    # Top Leads Section
    elements.append(Paragraph("📋 TOP LEADS", heading_style))

    leads_header = [["Owner", "Company", "Status", "Value", "Created"]]
    leads_table = Table(leads_header + LEADS_DATA[:10], colWidths=[1.8*inch, 1.8*inch, 1.5*inch, 1.2*inch, 1.2*inch])
    leads_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DC2626')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (0, 0), (1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(leads_table)
    elements.append(Spacer(1, 15))

    # Activities Section
    elements.append(Paragraph("✅ ACTIVITIES BREAKDOWN", heading_style))

    activities_header = [["Activity Type", "Count"]]
    activities_table = Table(activities_header + [[a[0], a[1]] for a in ACTIVITIES_DATA], colWidths=[4*inch, 1.5*inch])
    activities_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#059669')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F0FDF4')]),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(activities_table)
    elements.append(Spacer(1, 15))

    # User Performance Section
    elements.append(Paragraph("👥 USER PERFORMANCE", heading_style))

    users_header = [["Name", "Leads Owned", "Activities", "Pipeline"]]
    users_table = Table(users_header + USERS_PERFORMANCE, colWidths=[2.2*inch, 1.5*inch, 1.5*inch, 1.8*inch])
    users_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563EB')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#EFF6FF')]),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(users_table)
    elements.append(Spacer(1, 20))

    # Footer
    footer_text = f"Generated on {datetime.now().strftime('%d %b %Y at %H:%M:%S')} • Read-only Report • SBEE Cables India Ltd"
    footer = Paragraph(footer_text, ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#999999'),
        alignment=TA_CENTER
    ))
    elements.append(footer)

    # Build PDF
    doc.build(elements)
    print(f"✅ Report generated successfully: {filename}")
    return filename

if __name__ == "__main__":
    try:
        filename = generate_report()
        print(f"📄 PDF saved to: {filename}")
        print(f"📂 Location: {filename}")
    except ImportError:
        print("❌ reportlab not installed. Installing...")
        import subprocess
        subprocess.check_call(['pip3', 'install', 'reportlab'])
        filename = generate_report()
        print(f"✅ Report generated: {filename}")
    except Exception as e:
        print(f"❌ Error: {e}")
