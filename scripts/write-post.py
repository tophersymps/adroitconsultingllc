#!/usr/bin/env python3
"""Wrapper: runs pick-topic.py, generates MDX post, and commits it."""
import json
import subprocess
import sys
import os

WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    # Run pick-topic.py
    result = subprocess.run(
        [sys.executable, os.path.join(WORKSPACE, "scripts", "pick-topic.py")],
        capture_output=True, text=True, cwd=WORKSPACE
    )
    if result.returncode != 0:
        print(f"ERROR running pick-topic.py: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    
    topic = json.loads(result.stdout)
    slug = topic["slug"]
    
    # Check if this topic is already committed (file exists in content/)
    post_path = os.path.join(WORKSPACE, "content", f"{slug}.mdx")
    
    if os.path.exists(post_path):
        print(f"SKIP: Post already exists at {post_path}")
        return
    
    print(json.dumps(topic, indent=2))
    print(f"\nPost will be written to: {post_path}")
    
    # Signal that a new post is needed
    # The cron agent reads this output and generates the MDX content
    # This script exits here; the agent handles MDX generation

if __name__ == "__main__":
    main()
