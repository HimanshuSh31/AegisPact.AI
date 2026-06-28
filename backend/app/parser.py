import os
import logging
from typing import Dict, Any, List, Tuple, Optional
import pdfplumber

logger = logging.getLogger("contract_auditor.parser")

class ContractParser:
    """
    High-fidelity PDF document layout parser.
    Extracts structured layout blocks (paragraphs, headers, tables) with page maps and bounding boxes.
    """

    @staticmethod
    def _convert_table_to_markdown(table_data: List[List[Optional[str]]]) -> str:
        """
        Converts raw table rows into a clean Markdown table structure for LLM ingestion.
        """
        if not table_data or not table_data[0]:
            return ""
        
        # Clean cell text (replace newlines and strip whitespace)
        clean_rows = []
        for row in table_data:
            clean_row = []
            for cell in row:
                if cell is None:
                    clean_row.append("")
                else:
                    clean_row.append(str(cell).replace("\n", " ").strip())
            clean_rows.append(clean_row)

        cols_count = len(clean_rows[0])
        headers = clean_rows[0]
        rows = clean_rows[1:]

        # Create markdown table header
        md = "| " + " | ".join(headers) + " |\n"
        md += "| " + " | ".join(["---"] * cols_count) + " |\n"

        # Create rows
        for row in rows:
            # Ensure row length matches header length
            row_cells = row + [""] * (cols_count - len(row))
            md += "| " + " | ".join(row_cells[:cols_count]) + " |\n"
        
        return md

    def parse_txt(self, file_path: str) -> Dict[str, Any]:
        """
        Parses a plain text file into structural page layout segments.
        """
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
        except UnicodeDecodeError:
            with open(file_path, "r", encoding="latin-1") as f:
                text = f.read()

        paragraphs = text.split("\n\n")
        layout_elements = []
        for idx, p in enumerate(paragraphs):
            if p.strip():
                layout_elements.append({
                    "element_index": idx,
                    "type": "paragraph",
                    "text": p.strip(),
                    "bbox": [0.0, 0.0, 0.0, 0.0]
                })

        return {
            "file_name": os.path.basename(file_path),
            "pages": [{
                "page_number": 1,
                "width": 612.0,
                "height": 792.0,
                "text": text,
                "tables": [],
                "layout_elements": layout_elements
            }]
        }

    def parse_document(self, file_path: str) -> Dict[str, Any]:
        """
        Dispatches parsing based on file extension.
        """
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".txt":
            return self.parse_txt(file_path)
        else:
            return self.parse_pdf(file_path)

    def parse_pdf(self, file_path: str) -> Dict[str, Any]:
        """
        Parses a PDF contract into structural layout elements, text, and markdown tables.
        Returns a structured manifest dictionary.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        logger.info(f"Starting parsing of document: {file_path}")
        document_manifest = {
            "file_name": os.path.basename(file_path),
            "pages": []
        }

        try:
            with pdfplumber.open(file_path) as pdf:
                for idx, page in enumerate(pdf.pages):
                    page_num = idx + 1
                    width = float(page.width)
                    height = float(page.height)

                    logger.debug(f"Parsing page {page_num} (Dimensions: {width}x{height})")

                    # 1. Extract tables and their bounding boxes
                    extracted_tables = []
                    table_objs = page.find_tables()
                    for t_idx, table_obj in enumerate(table_objs):
                        # Extract table text representation
                        raw_table_data = table_obj.extract()
                        markdown_table = self._convert_table_to_markdown(raw_table_data)
                        
                        bbox = table_obj.bbox # (x0, y0, x1, y1)
                        extracted_tables.append({
                            "table_index": t_idx,
                            "bbox": [float(val) for val in bbox],
                            "markdown": markdown_table,
                            "raw": raw_table_data
                        })

                    # 2. Extract layout text blocks (avoid duplicate text in tables if possible)
                    # For simplicity, extract full text and also isolate non-table text blocks
                    full_text = page.extract_text() or ""
                    
                    # Grouping text blocks with bounding boxes
                    text_blocks = []
                    words = page.extract_words()
                    
                    # Reconstruct lines based on vertical positioning (y-coordinate)
                    if words:
                        # Group words that share a similar top/bottom coordinate
                        lines = []
                        current_line = []
                        last_top = -1
                        threshold = 3.0 # word height tolerance

                        # Sort words top-to-bottom, left-to-right
                        words_sorted = sorted(words, key=lambda w: (w["top"], w["x0"]))

                        for word in words_sorted:
                            if last_top == -1:
                                current_line.append(word)
                                last_top = word["top"]
                            elif abs(word["top"] - last_top) <= threshold:
                                current_line.append(word)
                            else:
                                lines.append(current_line)
                                current_line = [word]
                                last_top = word["top"]
                        if current_line:
                            lines.append(current_line)

                        # Assemble line blocks
                        for l_idx, line in enumerate(lines):
                            line_text = " ".join([w["text"] for w in line])
                            x0 = min([w["x0"] for w in line])
                            top = min([w["top"] for w in line])
                            x1 = max([w["x1"] for w in line])
                            bottom = max([w["bottom"] for w in line])

                            # Determine block type (Heading vs Paragraph based on font size/length)
                            block_type = "paragraph"
                            if len(line_text) < 100 and line_text.isupper():
                                block_type = "heading"
                            
                            text_blocks.append({
                                "element_index": l_idx,
                                "type": block_type,
                                "text": line_text,
                                "bbox": [float(x0), float(top), float(x1), float(bottom)]
                            })

                    document_manifest["pages"].append({
                        "page_number": page_num,
                        "width": width,
                        "height": height,
                        "text": full_text,
                        "tables": extracted_tables,
                        "layout_elements": text_blocks
                    })

            logger.info(f"Completed parsing of document: {file_path}. Total pages: {len(pdf.pages)}")
            return document_manifest

        except Exception as e:
            logger.error(f"Failed parsing PDF file {file_path}: {str(e)}", exc_info=True)
            raise e

# Example usage interface
if __name__ == "__main__":
    parser = ContractParser()
    # Dummy mock run just to ensure it parses imports
    print("ContractParser initialized successfully.")
