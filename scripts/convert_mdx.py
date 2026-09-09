#!/usr/bin/env python3
"""Convert MDX blog post to HTML body string for posts.ts."""
import re
import sys

def mdx_to_html(content: str) -> str:
    lines = content.split('\n')
    result = []
    in_table = False
    table_rows = []

    def escape_line(line):
        line = line.replace('&', '&amp;')
        line = line.replace('<', '&lt;')
        line = line.replace('>', '&gt;')
        return line

    i = 0
    while i < len(lines):
        line = lines[i]

        # Table row detection
        if line.startswith('|') and not in_table:
            in_table = True
            table_rows = []
            # Skip separator row if present
            if i + 1 < len(lines) and lines[i+1].strip().replace('|','').replace('-','').strip() == '':
                i += 2
                continue
            cells = [c.strip() for c in line.split('|')[1:-1]]
            table_rows.append(cells)
            i += 1
            continue
        elif in_table and line.startswith('|'):
            cells = [c.strip() for c in line.split('|')[1:-1]]
            table_rows.append(cells)
            i += 1
            continue
        elif in_table:
            if table_rows:
                result.append('<table>')
                for row in table_rows:
                    result.append('<tr>' + ''.join(f'<td>{escape_line(c)}</td>' for c in row) + '</tr>')
                result.append('</table>')
            in_table = False
            table_rows = []
            result.append(line)
            i += 1
            continue

        # Headings
        line = re.sub(r'^#{6}\s+(.+)', r'<h6>\1</h6>', line)
        line = re.sub(r'^#{5}\s+(.+)', r'<h5>\1</h5>', line)
        line = re.sub(r'^#{4}\s+(.+)', r'<h4>\1</h4>', line)
        line = re.sub(r'^#{3}\s+(.+)', r'<h3>\1</h3>', line)
        line = re.sub(r'^##\s+(.+)', r'<h2>\1</h2>', line)
        line = re.sub(r'^#\s+(.+)', r'<h1>\1</h1>', line)

        # Bold
        line = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', line)

        # Italic
        line = re.sub(r'\*(.+?)\*', r'<em>\1</em>', line)

        # Blockquote
        if line.startswith('> '):
            line = '<blockquote>' + escape_line(line[2:].strip()) + '</blockquote>'

        # Unordered list
        if line.startswith('- '):
            line = '<li>' + line[2:] + '</li>'

        # Horizontal rule
        if line.strip() == '---':
            line = '<hr>'

        result.append(line)
        i += 1

    # Handle any remaining table
    if in_table and table_rows:
        result.append('<table>')
        for row in table_rows:
            result.append('<tr>' + ''.join(f'<td>{escape_line(c)}</td>' for c in row) + '</tr>')
        result.append('</table>')

    html_out = '\n'.join(result)

    # Group consecutive <li> into <ul>
    final = []
    in_ul = False
    for line in html_out.split('\n'):
        if line.startswith('<li>'):
            if not in_ul:
                final.append('<ul>')
                in_ul = True
            final.append(line)
        else:
            if in_ul:
                final.append('</ul>')
                in_ul = False
            final.append(line)
    if in_ul:
        final.append('</ul>')

    return '\n\n'.join(final)


if __name__ == '__main__':
    with open(sys.argv[1]) as f:
        content = f.read()
    print(mdx_to_html(content))
