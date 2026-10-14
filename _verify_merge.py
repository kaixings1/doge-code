import os, re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

VC = r"D:/.github/mobile/gpt_mobile/viewchat"
GPT = r"D:/.github/mobile/gpt_mobile"

def read(p):
    try: return open(p, encoding="utf-8", errors="ignore").read()
    except: return ""

# 1. viewchat manifest 不应含 application name / LAUNCHER
mft = read(os.path.join(VC, "app/src/main/AndroidManifest.xml"))
print("[1] manifest: application块=%s  LAUNCHER=%s  App引用=%s" % (
    "有" if "<application" in mft else "无(ok)",
    "有(需移除)" if "LAUNCHER" in mft else "无(ok)",
    "有" if 'android:name=".App"' in mft else "无(ok)"))

# 2. layout 三个 include 是否存在
for inc in ["item_ai_chat_placeholder","item_ai_chat_error","item_ai_chat_loading"]:
    p = os.path.join(VC,"app/src/main/res/layout/%s.xml"%inc)
    print(f"[2] include {inc}.xml: {'存在' if os.path.exists(p) else '缺失!!'}")

# 3. Adapter 绑定的 view id 在 layout 中存在
for lay, ids in [("item_home_left.xml",["mtvLeftTextItemHomeLeft"]),
                 ("item_home_right.xml",["mtvRightTextItemHome"]),
                 ("activity_home.xml",["rcvListHome","etInputHome","mbSubmitHome","nsvContainerHome","incPlaceholderHome","incErrorHome","incLoadingHome"])]:
    txt = read(os.path.join(VC,"app/src/main/res/layout",lay))
    missing=[i for i in ids if 'android:id="@+id/%s"'%i not in txt and 'android:id="@id/%s"'%i not in txt]
    print(f"[3] {lay}: 缺失id={missing if missing else '无'}")

# 4. 新文件存在性
for f in ["presentation/widget/TypingCursorSpan.kt","utilities/MarkdownLiteFormatter.kt",
          "presentation/adapter/AdapterOpenAI.kt","data/entities/Message.kt"]:
    print(f"[4] {f}: {'存在' if os.path.exists(os.path.join(VC,'app/src/main/java/dev/pegasus/kleanbot',f)) else '缺失!!'}")

# 5. strings app_name 冲突检查
vc_strings = read(os.path.join(VC,"app/src/main/res/values/strings.xml"))
gpt_strings = []
for dp,dns,fns in os.walk(os.path.join(GPT,"app/src/main/res")):
    for fn in fns:
        if fn=="strings.xml":
            gpt_strings.append(read(os.path.join(dp,fn)))
gpt_has_appname = any('name="app_name"' in s for s in gpt_strings)
vc_has_appname = 'name="app_name"' in vc_strings
print(f"[5] app_name 冲突: gpt_mobile={gpt_has_appname}  viewchat={vc_has_appname}  -> {'可能冲突!' if gpt_has_appname and vc_has_appname else '无冲突'}")

# 6. Theme.KleanBot 定义存在
themes = read(os.path.join(VC,"app/src/main/res/values/themes.xml"))
print(f"[6] Theme.KleanBot 定义: {'存在' if 'Theme.KleanBot' in themes else '缺失!!'}")
