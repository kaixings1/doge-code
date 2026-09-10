#!/usr/bin/env python3
"""Generate skill-rules.json from all SKILL.md frontmatter."""
import os, re, json

SKILLS_DIR = os.path.join(os.path.dirname(__file__), '..', 'skills')
OUTPUT = os.path.join(SKILLS_DIR, "skill-rules.json")

STOP_WORDS = set("""
a an the is are was were be been being have has had do does did will would could should
may might can shall need must for to of in on at by from with through during before
after above below between out off over under again further then once here there when
where why how all both each few more most other some such no nor not only own same
so than too very just because but and or if while about into through during before
after above below between out off over under again further then once
and or not no yes this that these those what which who whom whose when where why how
""".split())

def extract_frontmatter(path):
    """Extract name and description from SKILL.md YAML frontmatter."""
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read(3000)  # Read first 3KB
    except:
        return None, None

    if not content.startswith("---"):
        return None, None

    end = content.find("---", 3)
    if end == -1:
        return None, None

    fm = content[3:end]

    name = None
    desc = None

    # Extract name
    m = re.search(r'^name:\s*(.+)', fm, re.MULTILINE)
    if m:
        name = m.group(1).strip().strip('"').strip("'")

    # Extract description
    m = re.search(r'^description:\s*(.+)', fm, re.MULTILINE)
    if m:
        desc = m.group(1).strip().strip('"').strip("'")
        # Truncate at 120 chars
        if len(desc) > 120:
            desc = desc[:117] + "..."

    return name, desc

def generate_keywords(name, desc):
    """Generate search keywords from name and description."""
    keywords = set()
    if name:
        # Add the full name
        keywords.add(name.lower())
        # Add parts of colon-separated names
        parts = name.split(":")
        keywords.update(p.lower() for p in parts if len(p) > 2)
        # Add hyphen-separated parts
        for part in parts:
            subparts = part.replace("-", " ").split()
            keywords.update(s.lower() for s in subparts if len(s) > 3 and s not in STOP_WORDS)

    if desc:
        # Extract meaningful words from description
        words = re.findall(r'[a-zA-Z\u4e00-\u9fff]+', desc.lower())
        for w in words:
            if len(w) > 3 and w not in STOP_WORDS:
                keywords.add(w)

    return sorted(keywords)

def generate_intent_patterns(name, desc):
    """Generate intent patterns from description."""
    patterns = []
    if desc:
        # Extract short phrases (3-6 words) that indicate when to use the skill
        text = desc.lower()
        # Common trigger patterns
        if "when" in text:
            idx = text.find("when")
            snippet = text[idx:idx+60].strip()
            if snippet:
                patterns.append(snippet[:50])
        if "use " in text:
            idx = text.find("use ")
            snippet = text[idx:idx+60].strip()
            if snippet:
                patterns.append(snippet[:50])
    return patterns[:3]

skills = []

for root, dirs, files in os.walk(SKILLS_DIR):
    # Skip hidden and archive dirs
    dirs[:] = [d for d in dirs if not d.startswith(".") and d != "_archived"]

    if "SKILL.md" in files:
        path = os.path.join(root, "SKILL.md")
        rel = os.path.relpath(path, SKILLS_DIR)

        name, desc = extract_frontmatter(path)
        if not name:
            # Fallback: use directory structure as name
            name = rel.replace("/SKILL.md", "").replace("\\", "/")
            desc = ""

        # Get short description from SKILL.md if no frontmatter desc
        if not desc:
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    for _ in range(30):
                        line = f.readline()
                        if line.startswith("#") and not line.startswith("---"):
                            desc = line.strip("# ").strip()
                            break
            except:
                pass

        keywords = generate_keywords(name, desc)
        intent_patterns = generate_intent_patterns(name, desc)

        # Determine if this is from a mega-directory
        top_dir = rel.split("/")[0] if "/" in rel else rel.split("\\")[0]
        is_bloat = top_dir in ("cybersecurity-skills", "ecc") or top_dir.startswith("repo-")

        skill = {
            "name": name,
            "description": desc[:120] if desc else "",
            "keywords": keywords[:8],  # Limit keywords
            "intentPatterns": intent_patterns,
            "enabled": True,
            "source": rel.replace("\\", "/"),
        }
        skills.append(skill)

rules = {
    "version": "1.0.0",
    "description": "Auto-generated skill activation rules. Skills in bloat directories are disabled by default.",
    "activationThreshold": 3,
    "skills": skills
}

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(rules, f, ensure_ascii=False, indent=2)

print(f"Generated {len(skills)} skill rules -> {OUTPUT}")

# Summary
bloat = [s for s in skills if "/" in s["source"]]
mega = [s for s in bloat if any(s["source"].startswith(p) for p in ("cybersecurity-skills/", "ecc/"))]
repo = [s for s in bloat if s["source"].split("/")[0].startswith("repo-")]
print(f"  Top-level (active): {len(skills) - len(bloat)}")
print(f"  Mega-dir skills: {len(mega)} (cybersecurity-skills + ecc)")
print(f"  Repo skills: {len(repo)}")
print(f"  Total: {len(skills)}")
