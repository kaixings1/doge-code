import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

sites = [
    # name, status, http, time_ms, website_url, key_url, api_url
    ('智谱 AI Zhipu',       'OK',       '200', '111ms',  'https://open.bigmodel.cn',                                                          'https://open.bigmodel.cn/usercenter/apikeys',     'https://open.bigmodel.cn/api/paas/v4/chat/completions'),
    ('阶跃星辰 StepFun',    'OK',       '200', '147ms',  'https://platform.stepfun.com',                                                      'https://platform.stepfun.com',                    'https://api.stepfun.com/v1/chat/completions'),
    ('讯飞星火 Xunfei',     'OK',       '200', '171ms',  'https://xinghuo.xfyun.cn',                                                          'https://xinghuo.xfyun.cn',                       'https://spark-api-open.xf-yun.com/v1/chat/completions'),
    ('DeepSeek',            'OK',       '429', '226ms',  'https://platform.deepseek.com',                                                     'https://platform.deepseek.com/api_keys',          'https://api.deepseek.com/v1/chat/completions'),
    ('月之暗面 Moonshot',   'OK',       '200', '330ms',  'https://platform.moonshot.cn',                                                      'https://platform.moonshot.cn',                   'https://api.moonshot.cn/v1/chat/completions'),
    ('阿里云百炼 Aliyun',   'OK',       '200', '436ms',  'https://bailian.aliyun.com',                                                        'https://bailian.aliyun.com',                     'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'),
    ('Groq',                'WAF',      '403', '320ms',  'https://console.groq.com',                                                          'https://console.groq.com/keys',                   'https://api.groq.com/openai/v1/chat/completions'),
    ('OpenRouter',          'WAF',      '403', '539ms',  'https://openrouter.ai',                                                             'https://openrouter.ai/settings/keys',            'https://openrouter.ai/api/v1/chat/completions'),
    ('Together AI',         'WAF',      '403', '606ms',  'https://api.together.xyz',                                                          'https://api.together.xyz/settings/api-keys',     'https://api.together.xyz/v1/chat/completions'),
    ('Cloudflare AI',       'WAF',      '403', '1563ms', 'https://dash.cloudflare.com',                                                       'https://dash.cloudflare.com/profile/api-tokens', 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/'),
    ('Ollama',              'Local',    '200', '943ms',  'https://ollama.com',                                                                 'https://ollama.com',                              'http://localhost:11434/v1/chat/completions'),
    ('Cerebras',            'Slow',     '200', '1182ms', 'https://cerebras.ai',                                                                'https://inference.cerebras.ai',                  'https://inference.cerebras.ai/v1/chat/completions'),
    ('Cohere',              'Slow',     '200', '1451ms', 'https://dashboard.cohere.com',                                                      'https://dashboard.cohere.com/api-keys',          'https://api.cohere.ai/v1/chat/completions'),
    ('NVIDIA NIM',          'Slow',     '202', '9184ms', 'https://build.nvidia.com',                                                           'https://build.nvidia.com',                       'https://integrate.api.nvidia.com/v1/chat/completions'),
    ('Google AI',           'TIMEOUT',  '—',   '20s',    'https://aistudio.google.com',                                                       'https://aistudio.google.com/app/apikey',         'https://generativelanguage.googleapis.com/v1beta/openai/'),
    ('Mistral',             'TIMEOUT',  '—',   '20s',    'https://console.mistral.ai',                                                        'https://console.mistral.ai/api-keys',            'https://api.mistral.ai/v1/chat/completions'),
    ('HuggingFace',         'TIMEOUT',  '—',   '10s',    'https://huggingface.co',                                                             'https://huggingface.co/settings/tokens',         'https://api-inference.huggingface.co/v1/chat/completions'),
    ('aiapiv2 Proxy',       'KEY DEAD', '401', '—',      'https://aiapiv2.pekpik.com',                                                        '—',                                               'https://aiapiv2.pekpik.com/v1/chat/completions'),
]

# Sort by status priority
status_order = {'OK': 0, 'WAF': 1, 'Local': 2, 'Slow': 3, 'TIMEOUT': 4, 'KEY DEAD': 5}
sites.sort(key=lambda x: (status_order.get(x[1], 99), x[3]))

print(f"{'#':<3} {'Name':<22} {'Status':<10} {'HTTP':<6} {'Time':<8} {'Website':<55} {'API Endpoint'}")
print("=" * 180)

for i, (name, status, http, ms, site_url, key_url, api_url) in enumerate(sites, 1):
    status_icon = {'OK': '[OK]', 'WAF': '[WAF]', 'Local': '[LOCAL]', 'Slow': '[SLOW]', 'TIMEOUT': '[TIMEOUT]', 'KEY DEAD': '[DEAD]'}.get(status, '[?]')
    print(f"{i:<3} {name:<22} {status_icon:<10} {http:<6} {ms:<8} {site_url:<55} {api_url}")

print("\n=== Key URLs (where to get API key) ===")
for name, status, http, ms, site_url, key_url, api_url in sites:
    if key_url != '—':
        print(f"  {name}: {key_url}")
