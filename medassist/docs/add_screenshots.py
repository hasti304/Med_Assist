"""
Script to add a Screenshots section to MedAssist_AI_Project_Report.docx.
Operates on the already-unpacked directory.
"""

import os
import shutil
import re
from PIL import Image

# Paths
UNPACKED = os.path.join(os.path.dirname(__file__), "unpacked_report")
IMG_SRC = os.path.join(os.path.dirname(__file__), "..", "img")
MEDIA_DIR = os.path.join(UNPACKED, "word", "media")
RELS_FILE = os.path.join(UNPACKED, "word", "_rels", "document.xml.rels")
CONTENT_TYPES_FILE = os.path.join(UNPACKED, "[Content_Types].xml")
DOCUMENT_XML = os.path.join(UNPACKED, "word", "document.xml")

# Target width in EMUs (~6 inches)
TARGET_WIDTH_EMU = 5486400
EMU_PER_PIXEL = 914400 / 96  # assumes 96 DPI; we'll use actual image dims

# Define all sections and their images (in order)
SECTIONS = [
    {
        "heading": "Authentication & Onboarding",
        "images": [
            ("login_page_with_google_Auth.png", "Login Page with Google OAuth"),
            ("Magic_link_new_login_acknowledgement.png", "Welcome Email on New Account Creation"),
        ],
    },
    {
        "heading": "Patient Dashboard",
        "images": [
            ("Dashboard.png", "Patient Dashboard — Health Score, Tips & Report Cards"),
        ],
    },
    {
        "heading": "Blood Report Upload",
        "images": [
            ("Upload_Report.png", "Blood Report Upload (File or Camera)"),
        ],
    },
    {
        "heading": "AI Blood Report Analysis",
        "images": [
            ("Report Analysis.png", "Analysis — Overall Summary & Abnormal Findings"),
            ("Report Analysis_1.png", "Analysis — Risk Score Breakdown & Follow-Up Care"),
            ("Report Analysis_2.png", "Analysis — Diet Plan & Recovery Ingredients"),
        ],
    },
    {
        "heading": "Report History & Comparison",
        "images": [
            ("My_Reports.png", "My Report History with Parameter Trend Charts"),
            ("Report comparison.png", "Side-by-Side Report Comparison with Delta Badges"),
        ],
    },
    {
        "heading": "Vitals Tracker",
        "images": [
            ("vitals.png", "Vitals Tracker — Blood Pressure 30-Day Trend"),
        ],
    },
    {
        "heading": "Multi-Language Support",
        "images": [
            ("Bilanguage_support_to_analysis.png", "Full Spanish UI with AI Chatbot Assistant"),
        ],
    },
    {
        "heading": "AI Chatbot Assistant",
        "images": [
            ("chatbot_support.png", "Report Assistant Chatbot (English)"),
        ],
    },
    {
        "heading": "Follow-Up Email Reminder",
        "images": [
            ("Followup_reminder_mail.png", "Automated Blood Test Recheck Reminder Email"),
        ],
    },
    {
        "heading": "Live Agent Tracking & Backend Logs",
        "images": [
            ("Agent_live_tracking.png", "Live Agent API Call Tracking (Langfuse)"),
            ("Backend_render_logs.png", "Backend Server Logs on Render"),
        ],
    },
]


def get_image_emu_dims(img_path, target_width_emu=TARGET_WIDTH_EMU):
    """Return (cx, cy) in EMUs, preserving aspect ratio at target_width."""
    with Image.open(img_path) as im:
        w_px, h_px = im.size
    # EMU ratio: target_width / original_width = scale
    cy = int(target_width_emu * h_px / w_px)
    return target_width_emu, cy


def get_existing_max_rid(rels_content):
    """Parse all rId numbers and return the max integer."""
    nums = [int(m) for m in re.findall(r'Id="rId(\d+)"', rels_content)]
    return max(nums) if nums else 0


def xml_escape(text):
    """Escape special XML characters in text."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


def make_image_paragraph(rid, img_name, img_id, cx, cy):
    """Build centered image paragraph XML."""
    safe_name = xml_escape(img_name)
    return f"""    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="{cx}" cy="{cy}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:docPr id="{img_id}" name="{safe_name}"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr>
                    <pic:cNvPr id="{img_id}" name="{safe_name}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="{rid}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="{cx}" cy="{cy}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>"""


def make_caption_paragraph(caption_text):
    """Build centered italic caption paragraph XML."""
    safe = xml_escape(caption_text)
    return f"""    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r>
        <w:rPr><w:i/><w:iCs/></w:rPr>
        <w:t>{safe}</w:t>
      </w:r>
    </w:p>"""


def make_empty_paragraph():
    return "    <w:p/>"


def make_heading1(text):
    safe = xml_escape(text)
    return f"""    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>{safe}</w:t></w:r>
    </w:p>"""


def make_heading2(text):
    safe = xml_escape(text)
    return f"""    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>{safe}</w:t></w:r>
    </w:p>"""


def make_page_break():
    return """    <w:p>
      <w:r>
        <w:br w:type="page"/>
      </w:r>
    </w:p>"""


# ── Step 1: Get image dimensions and build metadata ──────────────────────────

print("Computing image dimensions...")
# Build list of all images in order (flat)
all_images = []
for section in SECTIONS:
    for fname, caption in section["images"]:
        src = os.path.join(IMG_SRC, fname)
        cx, cy = get_image_emu_dims(src)
        all_images.append({"fname": fname, "caption": caption, "src": src, "cx": cx, "cy": cy})
        print(f"  {fname}: {cx} x {cy} EMUs")

# ── Step 2: Copy images into word/media/ ────────────────────────────────────

print("\nCopying images to media folder...")
# Find the next available media filename index
existing_media = os.listdir(MEDIA_DIR)
existing_indices = []
for name in existing_media:
    m = re.match(r"image(\d+)\.png", name)
    if m:
        existing_indices.append(int(m.group(1)))
next_idx = max(existing_indices) + 1 if existing_indices else 2

for img_info in all_images:
    dest_name = f"image{next_idx}.png"
    dest_path = os.path.join(MEDIA_DIR, dest_name)
    shutil.copy2(img_info["src"], dest_path)
    img_info["media_name"] = dest_name
    img_info["media_idx"] = next_idx
    print(f"  {img_info['fname']} -> {dest_name}")
    next_idx += 1

# ── Step 3: Update document.xml.rels ────────────────────────────────────────

print("\nUpdating document.xml.rels...")
with open(RELS_FILE, "r", encoding="utf-8") as f:
    rels_content = f.read()

max_rid = get_existing_max_rid(rels_content)
next_rid_num = max_rid + 1

IMAGE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"

new_rels = []
for img_info in all_images:
    rid = f"rId{next_rid_num}"
    img_info["rid"] = rid
    new_rels.append(
        f'  <Relationship Id="{rid}" Type="{IMAGE_REL_TYPE}" Target="media/{img_info["media_name"]}"/>'
    )
    print(f"  {rid} -> media/{img_info['media_name']}")
    next_rid_num += 1

# Insert new relationships before </Relationships>
new_rels_block = "\n".join(new_rels)
rels_content = rels_content.replace(
    "</Relationships>",
    new_rels_block + "\n</Relationships>"
)

with open(RELS_FILE, "w", encoding="utf-8") as f:
    f.write(rels_content)

# ── Step 4: Content types — PNG already present, nothing to do ──────────────
print("\n[Content_Types].xml already has PNG — no change needed.")

# ── Step 5: Build the new XML content to append ─────────────────────────────

print("\nBuilding new XML content...")

# Assign unique doc IDs for images (starting after existing max)
with open(DOCUMENT_XML, "r", encoding="utf-8") as f:
    doc_content = f.read()

existing_ids = [int(m) for m in re.findall(r'docPr id="(\d+)"', doc_content)]
next_doc_id = max(existing_ids) + 1 if existing_ids else 2

for img_info in all_images:
    img_info["doc_id"] = next_doc_id
    next_doc_id += 1

# Build the full XML block to insert
new_xml_parts = []

# Page break before Screenshots section
new_xml_parts.append(make_page_break())

# Heading 1
new_xml_parts.append(make_heading1("Screenshots"))

# Sections with their images
for section in SECTIONS:
    new_xml_parts.append(make_heading2(section["heading"]))
    for fname, caption in section["images"]:
        # Find the matching img_info
        img_info = next(i for i in all_images if i["fname"] == fname and i["caption"] == caption)
        new_xml_parts.append(
            make_image_paragraph(
                img_info["rid"],
                fname.replace(".png", ""),
                img_info["doc_id"],
                img_info["cx"],
                img_info["cy"],
            )
        )
        new_xml_parts.append(make_caption_paragraph(caption))
        new_xml_parts.append(make_empty_paragraph())

new_xml_block = "\n".join(new_xml_parts)

# ── Step 6: Insert into document.xml before </w:body> ───────────────────────

print("\nUpdating document.xml...")

# Insert just before the sectPr/w:body closing tags
# Find the last paragraph before sectPr and insert after it
insert_marker = "<w:sectPr"

if insert_marker not in doc_content:
    # Fallback: insert before </w:body>
    insert_marker = "</w:body>"
    doc_content = doc_content.replace(
        insert_marker,
        new_xml_block + "\n  " + insert_marker
    )
else:
    # Insert just before <w:sectPr
    idx = doc_content.rfind("<w:sectPr")
    doc_content = doc_content[:idx] + new_xml_block + "\n    " + doc_content[idx:]

with open(DOCUMENT_XML, "w", encoding="utf-8") as f:
    f.write(doc_content)

print("\nDone! All updates applied to unpacked_report.")
print("Now run pack.py to rebuild the DOCX.")
