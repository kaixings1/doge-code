## Arena Clone Using LLM — One Prompt, Two Models

A tiny clone of LMArena — send the same prompt to two LLMs side by side, read both responses, and vote on which one is better. Built with Gradio and the Groq API (free tier, no credit card required).

# Features
- Send one prompt to two different models simultaneously
- Compare responses side by side
- voting on each model's answer
- Shareable public link via Gradio (*.gradio.live, valid for 72 hours)

# Tech Stack
Gradio — UI
Groq API — free, fast LLM inference
OpenAI Python SDK — used as a compatible client for Groq's OpenAI-style endpoint


## Setup
Clone or download this project
Install dependencies

bash   pip install openai gradio python-dotenv
Get a free Groq API key
Sign up at console.groq.com and generate an API key — no payment details required.
Create a .env file in the project folder:


   GROQ_API_KEY=your_groq_api_key_here

## Run It

bashpython arena_app.py

You'll see output like:

Running on local URL:  http://127.0.0.1:7860 (may vary)
Running on public URL: https://abcd12.gradio.live (sample)

Open the local URL in your browser to use the app.
Share the public URL for ~72 hours (great for demos or LinkedIn posts).
Stop the server anytime with Ctrl + C.


## Models Used

SlotModelModel Allama-3.3-70b-versatileModel Bllama-3.1-8b-instant
Groq occasionally deprecates older models. If you get a model_decommissioned error, check the Groq deprecations page and swap in a currently supported model name in arena_app.py.


## Project Structure
.
├── arena.py        # Core battle logic (sends prompt to both models)
├── arena_app.py    # Gradio UI with voting
└── README.md

## How Voting Works

Clicking 👍 or 👎 under either model's response just shows a confirmation message. To make this useful for real analysis, extend the vote() function to log results to a file or database.