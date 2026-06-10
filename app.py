from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__)
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

if __name__ == "__main__":
    app.run(debug=True, port=5001)
