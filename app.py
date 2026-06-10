from flask import Flask, render_template, request, jsonify
import requests
import base64
import json
from datetime import datetime, timezone

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

@app.route("/api/moodle-assignments", methods=["POST"])
def get_moodle_assignments():
    data = request.json
    username = data.get("username")
    password = data.get("password")
    moodle_url = data.get("moodle_url")

    if not username or not password or not moodle_url:
        return jsonify({"error": "missing username, password, or url"}), 400

    moodle_url = moodle_url.rstrip("/")
    ws_url = f"{moodle_url}/webservice/rest/server.php"

    try:
        token_res = requests.get(
            f"{moodle_url}/login/token.php",
            params={"username": username, "password": password, "service": "moodle_mobile_app"},
            timeout=15
        )
        token_data = token_res.json()

        if "token" not in token_data:
            return jsonify({"error": token_data.get("error", "could not log in. check your username and password.")}), 400

        token = token_data["token"]

        site_info_res = requests.get(ws_url, params={
            "wstoken": token,
            "wsfunction": "core_webservice_get_site_info",
            "moodlewsrestformat": "json"
        }, timeout=15)
        site_info = site_info_res.json()

        if "userid" not in site_info:
            return jsonify({"error": site_info.get("error") or site_info.get("message", "could not load user info.")}), 400

        userid = site_info["userid"]

        courses_res = requests.get(ws_url, params={
            "wstoken": token,
            "wsfunction": "core_enrol_get_users_courses",
            "moodlewsrestformat": "json",
            "userid": userid
        }, timeout=15)
        courses = courses_res.json()

        if isinstance(courses, dict):
            return jsonify({"error": courses.get("error") or courses.get("message", "could not load courses.")}), 400
        if not isinstance(courses, list):
            return jsonify({"error": "could not load courses."}), 400

        course_names = {}
        for c in courses:
            if isinstance(c, dict) and "id" in c and c.get("visible", 1):
                course_names[c["id"]] = c.get("fullname", "unknown course")

        if not course_names:
            return jsonify({"assignments": []})

        assign_params = {
            "wstoken": token,
            "wsfunction": "mod_assign_get_assignments",
            "moodlewsrestformat": "json"
        }
        for i, course_id in enumerate(course_names.keys()):
            assign_params[f"courseids[{i}]"] = course_id

        assign_res = requests.get(ws_url, params=assign_params, timeout=15)
        assign_data = assign_res.json()

        if "courses" not in assign_data:
            return jsonify({"error": assign_data.get("error") or assign_data.get("message", "could not load assignments.")}), 400

        all_assignments = []

        for course in assign_data.get("courses", []):
            course_name = course_names.get(course.get("id"), course.get("fullname", "unknown course"))

            for a in course.get("assignments", []):
                due = a.get("duedate")
                if not due:
                    continue

                due_iso = datetime.fromtimestamp(due, tz=timezone.utc).isoformat()
                cmid = a.get("cmid")
                url = f"{moodle_url}/mod/assign/view.php?id={cmid}" if cmid else None

                all_assignments.append({
                    "title": a.get("name"),
                    "due": due_iso,
                    "course": course_name,
                    "url": url,
                    "source": "moodle"
                })

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

    known_courses = list(set(
        [a["course"] for a in allAssignmentsRaw] if False else []
    ))
    # get from request if sent
    req_courses = request.form.get("courses", "")
    course_list_str = req_courses if req_courses else "none provided"

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
                        "The course is usually a colored header line. The title is bold. Due date and points are in the gray meta line. Format all course names in title case (e.g. '2026 Spring Biology 1A'). "
                        f"For the course field, match to the closest name from this list if possible: {course_list_str}. "
                        "If nothing matches, use whatever course name appears in the screenshot."
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
