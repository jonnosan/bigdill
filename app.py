import json
import re
import uuid
from datetime import datetime, timezone

from flask import Flask, jsonify, request, send_file, render_template
from flask_sqlalchemy import SQLAlchemy
import io

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///bigdill.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)


class Game(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    game_name = db.Column(db.String(256), default='')
    game_id_tag = db.Column(db.String(256), default='')
    date = db.Column(db.String(64), default='')
    periods = db.Column(db.String(64), default='')
    video_url = db.Column(db.String(1024), default='')
    team_a = db.Column(db.String(256), default='')
    team_b = db.Column(db.String(256), default='')
    running_clock = db.Column(db.Boolean, default=False)
    roster_a = db.Column(db.Text, default='[]')
    roster_b = db.Column(db.Text, default='[]')
    bgdl_events = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self, full=True):
        d = {
            'id': self.id,
            'game_name': self.game_name,
            'game_id_tag': self.game_id_tag,
            'date': self.date,
            'periods': self.periods,
            'video_url': self.video_url,
            'team_a': self.team_a,
            'team_b': self.team_b,
            'running_clock': self.running_clock,
            'roster_a': json.loads(self.roster_a or '[]'),
            'roster_b': json.loads(self.roster_b or '[]'),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if full:
            d['bgdl_events'] = self.bgdl_events or ''
        else:
            # Count non-blank, non-comment lines for the list view
            lines = [l for l in (self.bgdl_events or '').splitlines()
                     if l.strip() and not l.strip().startswith('#')]
            d['event_count'] = len(lines)
        return d

    def to_bgdl(self):
        lines = []
        if self.game_name:
            lines.append(f'GAME: {self.game_name}')
        if self.game_id_tag:
            lines.append(f'GAME_ID: {self.game_id_tag}')
        if self.date:
            lines.append(f'DATE: {self.date}')
        if self.periods:
            lines.append(f'PERIODS: {self.periods}')
        if self.video_url:
            lines.append(f'VIDEO: {self.video_url}')
        if self.team_a:
            lines.append(f'A: {self.team_a}')
        if self.team_b:
            lines.append(f'B: {self.team_b}')
        lines.append('')
        if self.bgdl_events:
            lines.append(self.bgdl_events)
        return '\n'.join(lines)


def parse_bgdl_header(text):
    """Parse a BGDL text and return header fields as a dict."""
    fields = {}
    tag_map = {
        'GAME': 'game_name',
        'GAME_ID': 'game_id_tag',
        'DATE': 'date',
        'PERIODS': 'periods',
        'VIDEO': 'video_url',
        'A': 'team_a',
        'B': 'team_b',
    }
    header_re = re.compile(r'^([A-Z_]+)\s*:\s*(.*)$')
    event_lines = []
    in_events = False

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue
        m = header_re.match(stripped)
        if m and not in_events:
            tag, value = m.group(1), m.group(2).strip()
            key = tag_map.get(tag)
            if key:
                fields[key] = value
        else:
            in_events = True
            event_lines.append(line)

    fields['bgdl_events'] = '\n'.join(event_lines)
    return fields


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/games', methods=['GET'])
def list_games():
    games = Game.query.order_by(Game.updated_at.desc()).all()
    return jsonify([g.to_dict(full=False) for g in games])


@app.route('/api/games', methods=['POST'])
def create_game():
    data = request.get_json(force=True) or {}
    game = Game(
        id=str(uuid.uuid4()),
        game_name=data.get('game_name', ''),
        game_id_tag=data.get('game_id_tag', ''),
        date=data.get('date', ''),
        periods=data.get('periods', ''),
        video_url=data.get('video_url', ''),
        team_a=data.get('team_a', ''),
        team_b=data.get('team_b', ''),
        running_clock=data.get('running_clock', False),
        roster_a=json.dumps(data.get('roster_a', [])),
        roster_b=json.dumps(data.get('roster_b', [])),
        bgdl_events=data.get('bgdl_events', ''),
    )
    db.session.add(game)
    db.session.commit()
    return jsonify(game.to_dict()), 201


@app.route('/api/games/<game_id>', methods=['GET'])
def get_game(game_id):
    game = db.get_or_404(Game, game_id)
    return jsonify(game.to_dict())


@app.route('/api/games/<game_id>', methods=['PUT'])
def update_game(game_id):
    game = db.get_or_404(Game, game_id)
    data = request.get_json(force=True) or {}
    for field in ('game_name', 'game_id_tag', 'date', 'periods', 'video_url',
                  'team_a', 'team_b', 'bgdl_events'):
        if field in data:
            setattr(game, field, data[field])
    if 'running_clock' in data:
        game.running_clock = bool(data['running_clock'])
    if 'roster_a' in data:
        game.roster_a = json.dumps(data['roster_a'])
    if 'roster_b' in data:
        game.roster_b = json.dumps(data['roster_b'])
    game.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(game.to_dict())


@app.route('/api/games/<game_id>', methods=['DELETE'])
def delete_game(game_id):
    game = db.get_or_404(Game, game_id)
    db.session.delete(game)
    db.session.commit()
    return '', 204


@app.route('/api/games/<game_id>/export', methods=['GET'])
def export_game(game_id):
    game = db.get_or_404(Game, game_id)
    content = game.to_bgdl()
    filename = re.sub(r'[^\w\-]', '_', game.game_name or game_id) + '.bgdl'
    return send_file(
        io.BytesIO(content.encode('utf-8')),
        mimetype='text/plain',
        as_attachment=True,
        download_name=filename,
    )


@app.route('/api/games/import', methods=['POST'])
def import_game():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    f = request.files['file']
    text = f.read().decode('utf-8', errors='replace')
    fields = parse_bgdl_header(text)
    game = Game(
        id=str(uuid.uuid4()),
        game_name=fields.get('game_name', ''),
        game_id_tag=fields.get('game_id_tag', ''),
        date=fields.get('date', ''),
        periods=fields.get('periods', ''),
        video_url=fields.get('video_url', ''),
        team_a=fields.get('team_a', ''),
        team_b=fields.get('team_b', ''),
        bgdl_events=fields.get('bgdl_events', ''),
        roster_a='[]',
        roster_b='[]',
    )
    db.session.add(game)
    db.session.commit()
    return jsonify(game.to_dict()), 201


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
