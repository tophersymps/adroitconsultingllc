#!/usr/bin/env python3
"""
Topic picker for Adroit Blog content pipeline.

Reads content-calendar.json, picks the topic that was written longest ago
(rotational, oldest-first), and outputs a JSON object with the pillar and
topic for the next blog post.

Output:
  {"pillar": "Salesforce", "topic": "The Future of Flow", "slug": "...", "keywords": [...]}

Used by the Hermes cron job 'adroit-blog-writer' to auto-generate posts.
"""

import json
import os
import sys
from datetime import datetime, timezone

CALENDAR_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "content-calendar.json",
)

def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    return (
        text.lower()
        .replace(":", "")
        .replace("—", "")
        .replace("–", "")
        .replace("'", "")
        .replace('"', "")
        .replace(",", "")
        .replace(".", "")
        .replace("?", "")
        .replace("!", "")
        .replace("(", "")
        .replace(")", "")
        .replace("&", "and")
        .replace(" ", "-")
        .replace("--", "-")
        .strip("-")
    )

def load_calendar():
    with open(CALENDAR_PATH) as f:
        return json.load(f)

def load_picked_topics():
    """
    Track which topics have been picked by reading a state file.
    Returns a set of topic strings that have been used.
    """
    state_path = os.path.join(
        os.path.dirname(CALENDAR_PATH),
        ".picked-topics.json",
    )
    if os.path.exists(state_path):
        with open(state_path) as f:
            return set(json.load(f))
    return set()

def save_picked_topic(topic: str):
    """Record that a topic has been picked."""
    state_path = os.path.join(
        os.path.dirname(CALENDAR_PATH),
        ".picked-topics.json",
    )
    picked = load_picked_topics()
    picked.add(topic)
    with open(state_path, "w") as f:
        json.dump(sorted(picked), f, indent=2)

def extract_keywords(pillar: str, topic: str) -> list[str]:
    """Extract meaningful keywords from a topic for SEO metadata."""
    stop_words = {"a", "an", "the", "and", "or", "for", "in", "of", "to", "vs", "your", "is", "how", "what", "when", "why", "guide"}
    words = topic.lower().replace(":", " ").replace("—", " ").replace("–", " ").replace("'", "").split()
    return [w for w in words if w not in stop_words and len(w) > 2]

def pick_topic():
    calendar = load_calendar()
    picked = load_picked_topics()

    # Collect all topics with their pick status
    all_topics = []
    for pillar_entry in calendar:
        pillar = pillar_entry["pillar"]
        for topic in pillar_entry["topics"]:
            all_topics.append({
                "pillar": pillar,
                "topic": topic,
                "picked": topic in picked,
            })

    # Prefer unpicked topics (rotational), fallback to picked ones
    unpicked = [t for t in all_topics if not t["picked"]]
    candidate = unpicked[0] if unpicked else all_topics[len(picked) % len(all_topics)]

    # Save the pick
    save_picked_topic(candidate["topic"])

    result = {
        "pillar": candidate["pillar"],
        "topic": candidate["topic"],
        "slug": slugify(candidate["topic"]),
        "keywords": extract_keywords(candidate["pillar"], candidate["topic"]),
    }

    print(json.dumps(result, indent=2))
    return result

if __name__ == "__main__":
    pick_topic()
