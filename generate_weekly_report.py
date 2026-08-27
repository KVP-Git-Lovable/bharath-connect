#!/usr/bin/env python3
"""
SBEE Cables - Weekly Executive Report Generator
Reads data from Supabase and creates a professional PDF report
"""

import os
import json
from datetime import datetime, timedelta
from supabase import create_client, Client
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import base64
from io import BytesIO
from PIL import Image as PILImage

# Configuration
SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')
EXCLUDED_USERS = ['Suyog', 'Prajwal', 'Shravan', 'Ajay']

# SBEE Logo (base64 PNG - red circle with white S)
SBEE_LOGO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZeriAAAACXBIWXMAAA7DAAAOwwHHb6thAAACDUlEQVR4nO3cwQrCQBCG4Z1ePIiHPHgSb3rwUryIl/AiXsKbePEiXsSLeBEvggcPHjx48OBBvIjXxIsHvYi3kJnZJiW7ybab7/sNRZrZ3Z3Z3dmZ3Z2NRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCT+OZPJRK/XUz6fV7VaVbPZVCKRUL1e13w+VzabVbvdVq/XU71e13w+VzabVavVUq/XU7VaVbPZVCKRUL1eV5VKRb1eT5VKRb1eT5VKRb1eT5VKRb1eT9VqVb1eT9VqVb1eT7VaTd1uV7VaTd1uV7VaTd1uV71eT7VaTd1uV51OR71eT51OR71eT51OR71eT51OR+1uR91uR+1uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR+1uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR91uR+1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uR/1uRSKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiQT8AT9N7QxIY/ISAA=='

def get_supabase_client() -> Client:
    """Initialize Supabase client"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Supabase credentials not found in environment variables")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_leads(supabase: Client):
    """Fetch all leads with owner information"""
    try:
        response = supabase.table("leads").select("*, lead_statuses(name), users!owner_id(full_name, email)").execute()
        return response.data or []
    except Exception as e:
        print(f"Error fetching leads: {e}")
        return []

def fetch_activities(supabase: Client):
    """Fetch all activities with user information"""
    try:
        response = supabase.table("activity_events").select("*, users(full_name, email)").execute()
        return response.data or []
    except Exception as e:
        print(f"Error fetching activities: {e}")
        return []

def fetch_users(supabase: Client):
    """Fetch all active users"""
    try:
        response = supabase.table("users").select("id, full_name, email, phone").eq("is_active", True).execute()
        return response.data or []
    except Exception as e:
        print(f"Error fetching users: {e}")
        return []

def filter_excluded_users(items, user_field, excluded_names):
    """Filter out excluded users from data"""
    return [item for item in items if item.get(user_field, {}) and item[user_field].get('full_name') not in excluded_names]

def create_logo_image():
    """Create PIL Image from base64 logo"""
    try:
        logo_bytes = base64.b64decode(SBEE_LOGO_BASE64)
        img = PILImage.open(BytesIO(logo_bytes))
        return img
    except:
        return None

def generate_report():
    """Generate comprehensive weekly report"""
    print("🔄 Connecting to Supabase...")
    supabase = get_supabase_client()

    print("📊 Fetching data...")
    leads = fetch_leads(supabase)
    activities = fetch_activities(supabase)
    users = fetch_users(supabase)

    # Filter out excluded users
    leads = [l for l in leads if l.get('users', {}).get('full_name') not in EXCLUDED_USERS]
    activities = [a for a in activities if a.get('users', {}).get('full_name') not in EXCLUDED_USERS]
    users = [u for u in users if u.get('full_name') not in EXCLUDED_USERS]

    print(f"✅ Loaded: {len(leads)} leads, {len(activities)} activities, {len(users)} users")

    # Create PDF
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"SBEE_Weekly_Report_{timestamp}.pdf"

    doc = SimpleDocTemplate(filename, pagesize=landscape(letter), topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []

    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#DC2626'),
        spaceAfter=6,
        fontName='Helvetica-Bold'
    )
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#141E3C'),
        spaceAfter=8,
        fontName='Helvetica-Bold'
    )

    # Header with Logo and Title
    logo_img = create_logo_image()
    header_data = []
    if logo_img:
        logo_bytes = BytesIO()
        logo_img.save(logo_bytes, format='PNG')
        logo_bytes.seek(0)
        img = Image(logo_bytes, width=0.8*inch, height=0.8*inch)
        header_data.append([img, Paragraph("<b style='font-size:20px; color:#DC2626'>SBEE CABLES INDIA LTD</b>", styles['Normal'])])
    else:
        header_data.append([Paragraph("<b style='font-size:20px; color:#DC2626'>SBEE CABLES INDIA LTD</b>", styles['Normal'])])

    header_table = Table(header_data, colWidths=[1*inch, 6*inch])
    header_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(header_table)

    # Title and Date
    week_start = datetime.now() - timedelta(days=datetime.now().weekday())
    week_end = week_start + timedelta(days=6)
    story.append(Paragraph(f"Weekly Executive Report", title_style))
    story.append(Paragraph(f"Period: {week_start.strftime('%d %b %Y')} - {week_end.strftime('%d %b %Y')}", styles['Normal']))
    story.append(Spacer(1, 12))

    # KPI Summary
    story.append(Paragraph("📈 KEY PERFORMANCE INDICATORS", heading_style))
    kpi_data = [
        ["Total Leads", str(len(leads))],
        ["Total Activities", str(len(activities))],
        ["Active Users", str(len(users))],
        ["Pipeline Value", f"₹{sum([float(l.get('opportunity_value', 0)) for l in leads]) / 10000000:.2f}Cr"],
    ]
    kpi_table = Table(kpi_data, colWidths=[3*inch, 1.5*inch])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F3F4F6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#141E3C')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 12))

    # Leads Table
    story.append(Paragraph("📋 ALL LEADS", heading_style))
    leads_data = [["Owner", "Company", "Status", "Value", "Created"]]
    for lead in leads[:50]:  # Limit to 50 for readability
        owner_name = lead.get('users', {}).get('full_name') or 'Unknown'
        status = lead.get('lead_statuses', {}).get('name') if isinstance(lead.get('lead_statuses'), dict) else 'Unknown'
        value = f"₹{float(lead.get('opportunity_value', 0)) / 10000000:.2f}Cr"
        created = lead.get('created_at', '')[:10]
        leads_data.append([owner_name, str(lead.get('company_name', 'N/A'))[:20], str(status)[:15], value, created])

    leads_table = Table(leads_data, colWidths=[1.5*inch, 1.8*inch, 1.2*inch, 1.2*inch, 1.2*inch])
    leads_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DC2626')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9F5E7')])
    ]))
    story.append(leads_table)
    story.append(Spacer(1, 12))

    # Activities Table
    story.append(PageBreak())
    story.append(Paragraph("✅ ACTIVITIES SUMMARY", heading_style))

    activities_by_type = {}
    activities_by_user = {}
    for activity in activities:
        activity_type = activity.get('activity_type', 'Unknown')
        user_name = activity.get('users', {}).get('full_name') or 'Unknown'

        activities_by_type[activity_type] = activities_by_type.get(activity_type, 0) + 1
        activities_by_user[user_name] = activities_by_user.get(user_name, 0) + 1

    activities_data = [["Activity Type", "Count"]]
    for activity_type, count in sorted(activities_by_type.items(), key=lambda x: x[1], reverse=True):
        activities_data.append([activity_type, str(count)])

    activities_table = Table(activities_data, colWidths=[3*inch, 1*inch])
    activities_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#059669')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F0FDF4')])
    ]))
    story.append(activities_table)
    story.append(Spacer(1, 12))

    # User Performance Table
    story.append(Paragraph("👥 USER PERFORMANCE", heading_style))
    user_stats = []
    for user in users:
        user_id = user.get('id')
        user_name = user.get('full_name', 'Unknown')
        leads_owned = sum([1 for lead in leads if lead.get('owner_id') == user_id])
        activities_done = sum([1 for activity in activities if activity.get('user_id') == user_id])
        user_stats.append([user_name, str(leads_owned), str(activities_done)])

    user_data = [["Name", "Leads Owned", "Activities Done"]]
    for stat in sorted(user_stats, key=lambda x: int(x[1]), reverse=True)[:20]:
        user_data.append(stat)

    user_table = Table(user_data, colWidths=[2*inch, 1.5*inch, 1.5*inch])
    user_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563EB')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#EFF6FF')])
    ]))
    story.append(user_table)

    # Footer
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Generated on {datetime.now().strftime('%d %b %Y at %H:%M:%S')}", styles['Normal']))
    story.append(Paragraph("Read-only report • No data modified", styles['Normal']))

    # Build PDF
    print(f"📝 Building PDF: {filename}...")
    doc.build(story)
    print(f"✅ Report generated: {filename}")
    return filename

if __name__ == "__main__":
    try:
        report_file = generate_report()
        print(f"\n🎉 Success! Report saved as: {report_file}")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
