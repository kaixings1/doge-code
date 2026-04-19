from pathlib import Path
import re
from typing import List, Dict

def scan_ts_files(src_dir: str) -> dict:
    """Scan src/ directory for .ts files."""

    ts_extensions = ['.ts', '.tsx']
    results = {
        'files_scanned': 0,
        'english_strings_found': 0,
        'findings': []
    }

    src_path = Path(src_dir)

    if not src_path.exists():
        print(f"Warning: {src_dir} does not exist")
        return results

    for ts_file in sorted(src_path.glob('*.ts')) + sorted(src_path.glob('*.tsx')):
        results['files_scanned'] += 1

        try:
            with open(ts_file, 'r', encoding='utf-8') as f:
                content = f.read()

            # 🔍 Hex variable detection (common in TypeScript)
            hex_var_pattern = r'\b[0-9a-fA-F]+\b'

            # 🔤 Identifier and function/class name detection
            identifier_patterns = [
                '(?<![\\w])(?:A-Z_][\w]*)(?=\\b)',  # Word characters starting with uppercase
                r'[A-Z]\b',                         # Single word at start of line (likely class/function)
            ]

            for pattern in identifier_patterns:
                matches = re.findall(pattern, content)
                results['english_strings_found'] += len(matches)
                if matches:
                    print(f"🔤 Found {len(matches)} potential identifiers:")

        except Exception as e:
            print(f"❌ Error reading {ts_file}: {e}")

    return results

def process_replacements(content: str, replacements: Dict[str, str]) -> str:
    """Apply string replacements with Unicode escapes."""

    # Special character replacement
    content = re.sub(r'\u{2605}', '📊', content)

    # Hex variables → 📊 (Unicode symbol)
    content = re.sub(r'\b[0-9a-fA-F]+\b', '\U0001F534\g<0>', content)

    return content

# Main execution
if __name__ == "__main__":
    src_dir = "src"
    print("="*60)
    print("🔍 TSCODE ANALYSIS START")
    print("="*60)

    # Scan ts files
    scan_results = scan_ts_files(src_dir)

    if not scan_results['files_scanned']:
        print("\n❌ NO .TS FILES FOUND IN " + src_dir)
        exit(1)

    print(f"\n✓ SCANNED: {scan_results['files_scanned']} ts file(s)")

    # Process and display findings
    for i, finding in enumerate(scan_results['findings'], 1):
        if 'hex' in str(finding).lower():
            pattern = r'\b[0-9a-fA-F]+\b'
            content = re.sub(pattern, '\U0001F534\g<0>', finding)
            print(f"🔤 {i}. (Variable)")
            print(f"   • Original: '{finding}'")
            print(f"   →  Replaced with: '{content}'")
        elif 'identifier' in str(finding).lower():
            pattern = r'\b[A-Z]\w*\b' if re.search('[A-Z]\w*', finding) else '\b[0-9a-fA-F]+\b'
            content = re.sub(pattern, '\\2605\\1', finding)
            print(f"🔤 {i}. ({pattern})")
            print(f"   • Original: '{finding}'")
            print(f"   →  Replaced with: '{content}'")
