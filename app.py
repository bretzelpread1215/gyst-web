from flask import Flask, render_template, request, jsonify
import requests
import base64
import json

app = Flask(__name__)
from dotenv import load_dotenv
load_dotenv()
app.secret_key = "gyst-dev-key-change-later"

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/assignments", methods=["POST"])
def get_assignments():
    data = request.json
    token = data.get("token")
    canvas_url = data.get("canvas_url")

    if not token or not canvas_url:
        return jsonify({"error": "missing token or url"}), 400

    headers = {"Authorization": f"Bearer {token}"}

    try:
        courses_res = requests.get(
            f"{canvas_url}/api/v1/courses?enrollment_state=active&per_page=50",
            headers=headers,
            timeout=15
        )
        courses = courses_res.json()

        if not isinstance(courses, list):
            return jsonify({"error": "could not load courses. check your token."}), 400

        all_assignments = []

        for course in courses:
            if not isinstance(course, dict) or "id" not in course:
                continue

            course_id = course["id"]
            course_name = course.get("name", "unknown course")

            try:
                res = requests.get(
                    f"{canvas_url}/api/v1/courses/{course_id}/assignments?per_page=50&order_by=due_at",
                    headers=headers,
                    timeout=10
                )
                assignments = res.json()

                if not isinstance(assignments, list):
                    continue

                for a in assignments:
                    if a.get("due_at"):
                        all_assignments.append({
                            "title": a.get("name"),
                            "due": a.get("due_at"),
                            "course": course_name,
                            "url": a.get("html_url"),
                            "source": "canvas"
                        })
            except:
                continue

        all_assignments.sort(key=lambda x: x["due"])
        return jsonify({"assignments": all_assignments})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/scan", methods=["POST"])
def scan_image():
    if "image" not in request.files:
        return jsonify({"error": "no image uploaded"}), 400

    file = request.files["image"]
    image_data = file.read()
    b64 = base64.b64encode(image_data).decode("utf-8")
    media_type = file.content_type or "image/png"

    import anthropic as anthropic_sdk
    client = anthropic_sdk.Anthropic()  # reads ANTHROPIC_API_KEY from env automatically

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": b64
                    }
                },
                {
                    "type": "text",
                    "text": (
                        "Extract every assignment from this screenshot. "
                        "Return ONLY a JSON array, no prose, no markdown, no backticks. "
                        'Each item must have: {"title": string, "course": string or null, "due": ISO8601 string or null, "points": number or null}. '
                        "The course is usually a colored header line. The title is bold. Due date and points are in the gray meta line."
                    )
                }
            ]
        }]
    )

    import json
    raw = message.content[0].text.strip() if message.content and message.content[0].type == "text" else ""
    
    if not raw:
        # log what we actually got back for debugging
        print("Haiku response content:", message.content)
        return jsonify({"error": "no response from scan model"}), 500

    # strip markdown backticks if Haiku wrapped it anyway
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0].strip()

    assignments = json.loads(raw)
    return jsonify({"assignments": assignments})

if __name__ == "__main__":
    app.run(debug=True, port=5001)
