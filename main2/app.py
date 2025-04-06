# Disaster Management System - Python Implementation
# Main application file: app.py

import os
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit
import sqlite3
from datetime import datetime
import uuid
import json
from werkzeug.utils import secure_filename

app = Flask(__name__, 
            template_folder='../templates',
            static_folder='../static')
app.config['SECRET_KEY'] = 'disaster_management_secret_key'
app.config['UPLOAD_FOLDER'] = 'static/uploads'
socketio = SocketIO(app)

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Database setup
def init_db():
    conn = sqlite3.connect('disaster_management.db')
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'user'
    )
    ''')
    
    # Incidents table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        description TEXT,
        image_path TEXT,
        audio_path TEXT,
        reported_by TEXT,
        reported_at TIMESTAMP,
        urgency TEXT,
        status TEXT DEFAULT 'active',
        verification_count INTEGER DEFAULT 0,
        FOREIGN KEY (reported_by) REFERENCES users (id)
    )
    ''')
    
    # Resources table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        description TEXT,
        contact TEXT,
        capacity INTEGER,
        current_load INTEGER DEFAULT 0,
        status TEXT DEFAULT 'operational'
    )
    ''')
    
    # SOS alerts table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sos_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        message TEXT,
        created_at TIMESTAMP,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    
    # Broadcasts table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS broadcasts (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        message TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        radius REAL,
        created_at TIMESTAMP,
        expires_at TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users (id)
    )
    ''')
    
    # Shelters table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS shelters (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        capacity INTEGER,
        contact TEXT,
        status TEXT,
        latitude REAL,
        longitude REAL,
        created_by TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    )
    ''')
    
    conn.commit()
    conn.close()

# Initialize database on startup
init_db()

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        conn = sqlite3.connect('disaster_management.db')
        cursor = conn.cursor()
        cursor.execute('SELECT id, role FROM users WHERE username = ? AND password = ?', 
                      (username, password))
        user = cursor.fetchone()
        conn.close()
        
        if user:
            session['user_id'] = user[0]
            session['role'] = user[1]
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error='Invalid credentials')
    
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        phone = request.form.get('phone')
        
        conn = sqlite3.connect('disaster_management.db')
        cursor = conn.cursor()
        
        try:
            user_id = str(uuid.uuid4())
            cursor.execute('INSERT INTO users (id, username, password, phone) VALUES (?, ?, ?, ?)',
                          (user_id, username, password, phone))
            conn.commit()
            conn.close()
            
            session['user_id'] = user_id
            session['role'] = 'user'
            return redirect(url_for('dashboard'))
        except sqlite3.IntegrityError:
            conn.close()
            return render_template('register.html', error='Username already exists')
    
    return render_template('register.html')

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    return render_template('dashboard.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/map')
def map_view():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    return render_template('map.html')

# API Routes
@app.route('/api/incidents', methods=['GET', 'POST'])
def incidents():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if request.method == 'POST':
        print("Received incident report submission")
        # Create new incident
        data = request.form
        incident_id = str(uuid.uuid4())
        incident_type = data.get('type')
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        description = data.get('description')
        urgency = data.get('urgency', 'medium')
        
        # Print form data for debugging
        print(f"Incident data: type={incident_type}, lat={latitude}, lng={longitude}, urgency={urgency}")
        
        # Handle image upload
        image_path = None
        if 'image' in request.files:
            image = request.files['image']
            if image.filename:
                filename = secure_filename(f"{incident_id}_{image.filename}")
                image_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                image.save(image_path)
                print(f"Image saved to {image_path}")
                
        # Handle audio upload
        audio_path = None
        if 'audio' in request.files:
            audio = request.files['audio']
            if audio.filename:
                filename = secure_filename(f"{incident_id}_{audio.filename}")
                audio_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                audio.save(audio_path)
                print(f"Audio saved to {audio_path}")
        
        cursor.execute('''
        INSERT INTO incidents 
        (id, type, latitude, longitude, description, image_path, audio_path, 
         reported_by, reported_at, urgency, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (incident_id, incident_type, latitude, longitude, description, 
              image_path, audio_path, session['user_id'], 
              datetime.now().isoformat(), urgency, 'active'))
        
        conn.commit()
        
        # Fetch the complete incident record to return
        cursor.execute('SELECT * FROM incidents WHERE id = ?', (incident_id,))
        incident_record = cursor.fetchone()
        
        if not incident_record:
            print(f"ERROR: Could not fetch newly created incident with ID {incident_id}")
            return jsonify({'error': 'Failed to create incident'}), 500
            
        incident_data = dict(incident_record)
        
        # Ensure all required fields exist in the broadcast
        broadcast_data = {
            'id': incident_id,
            'type': incident_type,
            'latitude': float(latitude) if latitude else 0,
            'longitude': float(longitude) if longitude else 0,
            'description': description or '',
            'urgency': urgency or 'medium',
            'status': 'active',
            'reported_at': datetime.now().isoformat(),
            'verification_count': 0,
            'image_path': image_path,
            'audio_path': audio_path
        }
        
        # Broadcast new incident to all connected clients
        print(f"Broadcasting new incident: {incident_id}")
        socketio.emit('new_incident', broadcast_data)
        
        return jsonify(incident_data)
    else:
        # Get all incidents with filters
        incident_type = request.args.get('type')
        urgency = request.args.get('urgency')
        status = request.args.get('status', 'active')
        time_from = request.args.get('time_from')
        
        query = 'SELECT * FROM incidents WHERE status = ?'
        params = [status]
        
        if incident_type:
            query += ' AND type = ?'
            params.append(incident_type)
        
        if urgency:
            query += ' AND urgency = ?'
            params.append(urgency)
        
        if time_from:
            query += ' AND reported_at >= ?'
            params.append(time_from)
        
        cursor.execute(query, params)
        incidents = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        print(f"Returning {len(incidents)} incidents")
        return jsonify(incidents)

@app.route('/api/incidents/<incident_id>/verify', methods=['POST'])
def verify_incident(incident_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect('disaster_management.db')
    cursor = conn.cursor()
    
    cursor.execute('UPDATE incidents SET verification_count = verification_count + 1 WHERE id = ?',
                  (incident_id,))
    conn.commit()
    
    cursor.execute('SELECT verification_count FROM incidents WHERE id = ?', (incident_id,))
    count = cursor.fetchone()[0]
    conn.close()
    
    # Broadcast verification update
    socketio.emit('incident_verified', {
        'incident_id': incident_id,
        'verification_count': count
    })
    
    return jsonify({'success': True, 'verification_count': count})

@app.route('/api/resources', methods=['GET', 'POST'])
def resources():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if request.method == 'POST':
        # Admin only
        if session.get('role') != 'admin':
            conn.close()
            return jsonify({'error': 'Not authorized'}), 403
        
        # Create new resource
        data = request.json
        resource_id = str(uuid.uuid4())
        
        cursor.execute('''
        INSERT INTO resources 
        (id, type, name, latitude, longitude, description, contact, capacity, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (resource_id, data.get('type'), data.get('name'), 
              data.get('latitude'), data.get('longitude'), data.get('description'),
              data.get('contact'), data.get('capacity'), 'operational'))
        
        conn.commit()
        
        # Broadcast new resource to all connected clients
        socketio.emit('new_resource', {
            'id': resource_id,
            'type': data.get('type'),
            'name': data.get('name'),
            'latitude': data.get('latitude'),
            'longitude': data.get('longitude'),
            'description': data.get('description')
        })
        
        return jsonify({'success': True, 'resource_id': resource_id})
    else:
        # Get all resources with filters
        resource_type = request.args.get('type')
        
        query = 'SELECT * FROM resources WHERE status = "operational"'
        params = []
        
        if resource_type:
            query += ' AND type = ?'
            params.append(resource_type)
        
        cursor.execute(query, params)
        resources = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        return jsonify(resources)

@app.route('/api/sos', methods=['POST', 'GET'])
def create_sos():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if request.method == 'GET':
        # Get active SOS alerts
        status = request.args.get('status', 'active')
        cursor.execute('''
        SELECT s.*, u.username 
        FROM sos_alerts s
        JOIN users u ON s.user_id = u.id
        WHERE s.status = ?
        ORDER BY s.created_at DESC
        ''', (status,))
        
        sos_alerts = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(sos_alerts)
    else:  # POST method
        data = request.json
        sos_id = str(uuid.uuid4())
        
        cursor.execute('''
        INSERT INTO sos_alerts 
        (id, user_id, latitude, longitude, message, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (sos_id, session['user_id'], data.get('latitude'), data.get('longitude'),
            data.get('message'), datetime.now().isoformat(), 'active'))
        
        conn.commit()
        conn.close()
        
        # Broadcast SOS alert to all connected clients
        socketio.emit('sos_alert', {
            'id': sos_id,
            'latitude': data.get('latitude'),
            'longitude': data.get('longitude'),
            'message': data.get('message'),
            'created_at': datetime.now().isoformat()
        })
        
        return jsonify({'success': True, 'sos_id': sos_id})

@app.route('/api/broadcast', methods=['POST'])
def create_broadcast():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Allow all authenticated users to broadcast (for testing)
    # Removed role restriction: if session.get('role') not in ['admin', 'emergency']:
    
    conn = sqlite3.connect('disaster_management.db')
    cursor = conn.cursor()
    
    data = request.json
    broadcast_id = str(uuid.uuid4())
    
    cursor.execute('''
    INSERT INTO broadcasts 
    (id, sender_id, message, latitude, longitude, radius, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (broadcast_id, session['user_id'], data.get('message'),
          data.get('latitude'), data.get('longitude'), data.get('radius', 5.0),
          datetime.now().isoformat(), data.get('expires_at')))
    
    conn.commit()
    conn.close()
    
    # Broadcast to all connected clients in range
    socketio.emit('emergency_broadcast', {
        'id': broadcast_id,
        'message': data.get('message'),
        'latitude': data.get('latitude'),
        'longitude': data.get('longitude'),
        'radius': data.get('radius', 5.0),
        'created_at': datetime.now().isoformat()
    })
    
    return jsonify({'success': True, 'broadcast_id': broadcast_id})

# Socket.IO events
@socketio.on('connect')
def handle_connect():
    if 'user_id' not in session:
        return False
    print(f"Client connected: {request.sid}")

@socketio.on('update_location')
def handle_location_update(data):
    if 'user_id' not in session:
        return
    
    # Update user's last known location (can be stored in a separate table)
    # For now, just broadcast to nearby users
    data['user_id'] = session['user_id']
    emit('user_location_update', data, broadcast=True, include_self=False)
    # Add these functions to your app.py file

# New API endpoint for dashboard data
@app.route('/api/dashboard/summary', methods=['GET'])
def dashboard_summary():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get active incidents count
    cursor.execute('SELECT COUNT(*) FROM incidents WHERE status = "active"')
    active_incidents = cursor.fetchone()[0]
    
    # Get recent incidents (limit 5)
    cursor.execute('''
        SELECT * FROM incidents 
        WHERE status = "active" 
        ORDER BY reported_at DESC LIMIT 5
    ''')
    recent_incidents = [dict(row) for row in cursor.fetchall()]
    
    # Get active SOS alerts count
    cursor.execute('SELECT COUNT(*) FROM sos_alerts WHERE status = "active"')
    active_sos = cursor.fetchone()[0]
    
    # Get active SOS alerts (with user information)
    cursor.execute('''
        SELECT s.*, u.username 
        FROM sos_alerts s
        JOIN users u ON s.user_id = u.id
        WHERE s.status = "active" 
        ORDER BY s.created_at DESC
    ''')
    sos_alerts = []
    for row in cursor.fetchall():
        alert = dict(row)
        alert['user'] = alert['username']  # Add username for compatibility
        sos_alerts.append(alert)
    
    # Get operational resources count
    cursor.execute('SELECT COUNT(*) FROM resources WHERE status = "operational"')
    resource_count = cursor.fetchone()[0]
    
    # Get resources
    cursor.execute('''
        SELECT * FROM resources 
        WHERE status = "operational"
        ORDER BY type
    ''')
    resources = [dict(row) for row in cursor.fetchall()]
    
    # Get recent broadcasts
    cursor.execute('''
        SELECT * FROM broadcasts
        ORDER BY created_at DESC
        LIMIT 10
    ''')
    broadcasts = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    # Prepare the summary data
    summary = {
        'active_incidents': active_incidents,
        'sos_alerts': active_sos,
        'available_resources': resource_count,
        'recent_incidents': recent_incidents,
        'active_sos_alerts': sos_alerts,
        'emergency_broadcasts': [b['message'] for b in broadcasts],
        'resource_availability': [
            {
                'type': r['name'], 
                'quantity': r['capacity'] - r['current_load']
            } for r in resources
        ]
    }
    
    return jsonify(summary)

# New API endpoint for broadcasts
@app.route('/api/broadcasts', methods=['GET'])
def get_broadcasts():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get recent broadcasts
    cursor.execute('''
        SELECT * FROM broadcasts
        ORDER BY created_at DESC
        LIMIT 10
    ''')
    broadcasts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(broadcasts)

# New Socket.IO endpoint for dashboard data
@socketio.on('request_dashboard_data')
def handle_dashboard_request():
    if 'user_id' not in session:
        return
    
    # Use the dashboard_summary function to get data
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get active incidents count
    cursor.execute('SELECT COUNT(*) FROM incidents WHERE status = "active"')
    active_incidents = cursor.fetchone()[0]
    
    # Get recent incidents (limit 5)
    cursor.execute('''
        SELECT * FROM incidents 
        WHERE status = "active" 
        ORDER BY reported_at DESC LIMIT 5
    ''')
    recent_incidents = [dict(row) for row in cursor.fetchall()]
    
    # Get active SOS alerts count
    cursor.execute('SELECT COUNT(*) FROM sos_alerts WHERE status = "active"')
    active_sos = cursor.fetchone()[0]
    
    # Get active SOS alerts (with user information)
    cursor.execute('''
        SELECT s.*, u.username 
        FROM sos_alerts s
        JOIN users u ON s.user_id = u.id
        WHERE s.status = "active" 
        ORDER BY s.created_at DESC
    ''')
    sos_alerts = []
    for row in cursor.fetchall():
        alert = dict(row)
        alert['user'] = alert['username']  # Add username for compatibility
        sos_alerts.append(alert)
    
    # Get operational resources count
    cursor.execute('SELECT COUNT(*) FROM resources WHERE status = "operational"')
    resource_count = cursor.fetchone()[0]
    
    # Get resources
    cursor.execute('''
        SELECT * FROM resources 
        WHERE status = "operational"
        ORDER BY type
    ''')
    resources = [dict(row) for row in cursor.fetchall()]
    
    # Get recent broadcasts
    cursor.execute('''
        SELECT * FROM broadcasts
        ORDER BY created_at DESC
        LIMIT 10
    ''')
    broadcasts = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    # Prepare the summary data
    summary = {
        'active_incidents': active_incidents,
        'sos_alerts': active_sos,
        'available_resources': resource_count,
        'recent_incidents': recent_incidents,
        'active_sos_alerts': sos_alerts,
        'emergency_broadcasts': [b['message'] for b in broadcasts],
        'resource_availability': [
            {
                'type': r['name'], 
                'quantity': r['capacity'] - r['current_load']
            } for r in resources
        ]
    }
    
    # Send data to the requesting client
    emit('dashboard_update', summary)

# Update incident status API
@app.route('/api/incidents/<incident_id>/status', methods=['PUT'])
def update_incident_status(incident_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Only admin or emergency personnel can change status
    if session.get('role') not in ['admin', 'emergency']:
        return jsonify({'error': 'Not authorized'}), 403
    
    data = request.json
    new_status = data.get('status')
    
    if new_status not in ['active', 'resolved', 'cleared', 'expected']:
        return jsonify({'error': 'Invalid status'}), 400
    
    conn = sqlite3.connect('disaster_management.db')
    cursor = conn.cursor()
    
    cursor.execute('UPDATE incidents SET status = ? WHERE id = ?',
                  (new_status, incident_id))
    conn.commit()
    conn.close()
    
    # Broadcast status update
    socketio.emit('incident_status_update', {
        'incident_id': incident_id,
        'status': new_status
    })
    
    return jsonify({'success': True})

# Update SOS status API
@app.route('/api/sos/<sos_id>/status', methods=['PUT'])
def update_sos_status(sos_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    new_status = data.get('status')
    
    if new_status not in ['active', 'resolved']:
        return jsonify({'error': 'Invalid status'}), 400
    
    conn = sqlite3.connect('disaster_management.db')
    cursor = conn.cursor()
    
    cursor.execute('UPDATE sos_alerts SET status = ? WHERE id = ?',
                  (new_status, sos_id))
    conn.commit()
    conn.close()
    
    # Broadcast status update
    socketio.emit('sos_status_update', {
        'sos_id': sos_id,
        'status': new_status
    })
    
    return jsonify({'success': True})

# Helper function to get user information
@app.route('/api/users/<user_id>', methods=['GET'])
def get_user(user_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT id, username, phone, role FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if user:
        return jsonify(dict(user))
    else:
        return jsonify({'error': 'User not found'}), 404

@app.route('/api/shelters', methods=['GET'])
def get_shelters():
    """Get all shelters or filter by status"""
    status = request.args.get('status', 'all')
    
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Ensure the shelters table has current_occupancy column
    try:
        cursor.execute("PRAGMA table_info(shelters)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'current_occupancy' not in columns:
            cursor.execute('ALTER TABLE shelters ADD COLUMN current_occupancy INTEGER DEFAULT 0')
            conn.commit()
            print("Added current_occupancy column to shelters table")
    except Exception as e:
        print(f"Error checking/updating shelters schema: {e}")
    
    if status != 'all':
        cursor.execute('SELECT * FROM shelters WHERE status = ?', (status,))
    else:
        cursor.execute('SELECT * FROM shelters')
    
    shelters = []
    for row in cursor.fetchall():
        shelter = dict(row)
        
        # Get resources for this shelter
        cursor.execute('SELECT id, name, quantity FROM shelter_resources WHERE shelter_id = ?', (shelter['id'],))
        shelter_resources = [dict(row) for row in cursor.fetchall()]
        shelter['resources'] = shelter_resources
        
        shelters.append(shelter)
    
    conn.close()
    return jsonify(shelters)

@app.route('/api/shelters', methods=['POST'])
def create_shelter():
    """Create a new shelter"""
    if 'user_id' not in session:
        return jsonify({'error': 'Authentication required'}), 401
    
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['name', 'description', 'capacity', 'latitude', 'longitude', 'status']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    user_id = session['user_id']
    
    conn = sqlite3.connect('disaster_management.db')
    cursor = conn.cursor()
    
    # Insert shelter basic info
    cursor.execute('''
        INSERT INTO shelters (name, description, capacity, contact, status, latitude, longitude, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ''', (
        data['name'],
        data['description'],
        data['capacity'],
        data.get('contact', ''),
        data['status'],
        data['latitude'],
        data['longitude'],
        user_id
    ))
    
    shelter_id = cursor.lastrowid
    
    # Handle resources if provided
    resources = data.get('resources', [])
    
    # Create shelter_resources table if it doesn't exist
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS shelter_resources (
        id INTEGER PRIMARY KEY,
        shelter_id INTEGER,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY (shelter_id) REFERENCES shelters (id)
    )
    ''')
    
    # Insert resources
    for resource in resources:
        cursor.execute('''
            INSERT INTO shelter_resources (shelter_id, name, quantity)
            VALUES (?, ?, ?)
        ''', (
            shelter_id,
            resource['name'],
            resource['quantity']
        ))
    
    conn.commit()
    
    # Close the current connection and reopen with row_factory
    conn.close()
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get the newly created shelter with resources
    cursor.execute('SELECT * FROM shelters WHERE id = ?', (shelter_id,))
    shelter_row = cursor.fetchone()
    
    # Convert to dictionary if not None, otherwise create an empty dict
    if shelter_row:
        shelter = dict(shelter_row)
    else:
        # Return the basic data if no row found
        shelter = {
            'id': shelter_id,
            'name': data['name'],
            'description': data['description'],
            'capacity': data['capacity'],
            'contact': data.get('contact', ''),
            'status': data['status'],
            'latitude': data['latitude'],
            'longitude': data['longitude']
        }
    
    # Get resources for this shelter
    cursor.execute('SELECT id, name, quantity FROM shelter_resources WHERE shelter_id = ?', (shelter_id,))
    shelter_resources = [dict(row) for row in cursor.fetchall()]
    
    # Add resources to shelter object
    shelter['resources'] = shelter_resources
    
    conn.close()
    
    # Broadcast the new shelter to connected clients
    socketio.emit('new_shelter', shelter)
    
    return jsonify({'success': True, 'id': shelter_id, 'shelter': shelter})

@app.route('/api/shelters/<int:shelter_id>', methods=['GET'])
def get_shelter(shelter_id):
    """Get a specific shelter by ID"""
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM shelters WHERE id = ?', (shelter_id,))
    shelter_row = cursor.fetchone()
    
    if not shelter_row:
        conn.close()
        return jsonify({'error': 'Shelter not found'}), 404
        
    shelter = dict(shelter_row)
    
    # Get resources for this shelter
    cursor.execute('SELECT id, name, quantity FROM shelter_resources WHERE shelter_id = ?', (shelter_id,))
    shelter_resources = [dict(row) for row in cursor.fetchall()]
    shelter['resources'] = shelter_resources
    
    conn.close()
    
    return jsonify(shelter)

@app.route('/api/shelters/<int:shelter_id>', methods=['PUT'])
def update_shelter(shelter_id):
    """Update a shelter's details"""
    if 'user_id' not in session:
        return jsonify({'error': 'Authentication required'}), 401
    
    data = request.get_json()
    
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Check if shelter exists
    cursor.execute('SELECT * FROM shelters WHERE id = ?', (shelter_id,))
    existing_shelter = cursor.fetchone()
    
    if not existing_shelter:
        conn.close()
        return jsonify({'error': 'Shelter not found'}), 404
    
    # Update shelter fields
    updates = []
    params = []
    
    update_fields = ['name', 'description', 'capacity', 'contact', 'status', 'latitude', 'longitude']
    for field in update_fields:
        if field in data:
            updates.append(f'{field} = ?')
            params.append(data[field])
    
    if updates:
        # Add shelter_id to params
        params.append(shelter_id)
        
        cursor.execute(f'''
            UPDATE shelters
            SET {', '.join(updates)}, updated_at = datetime('now')
            WHERE id = ?
        ''', params)
    
    # Handle resources if provided
    if 'resources' in data:
        # Delete existing resources
        cursor.execute('DELETE FROM shelter_resources WHERE shelter_id = ?', (shelter_id,))
        
        # Insert new resources
        for resource in data['resources']:
            cursor.execute('''
                INSERT INTO shelter_resources (shelter_id, name, quantity)
                VALUES (?, ?, ?)
            ''', (
                shelter_id,
                resource['name'],
                resource['quantity']
            ))
    
    conn.commit()
    
    # Get the updated shelter with resources
    cursor.execute('SELECT * FROM shelters WHERE id = ?', (shelter_id,))
    shelter = dict(cursor.fetchone())
    
    # Get resources for this shelter
    cursor.execute('SELECT id, name, quantity FROM shelter_resources WHERE shelter_id = ?', (shelter_id,))
    shelter_resources = [dict(row) for row in cursor.fetchall()]
    shelter['resources'] = shelter_resources
    
    conn.close()
    
    # Broadcast the updated shelter to connected clients
    socketio.emit('shelter_updated', shelter)
    
    return jsonify({'success': True, 'shelter': shelter})

@app.route('/api/shelters/<int:shelter_id>/occupancy', methods=['PUT'])
def update_shelter_occupancy(shelter_id):
    """Update a shelter's current occupancy"""
    if 'user_id' not in session:
        return jsonify({'error': 'Authentication required'}), 401
    
    data = request.get_json()
    if 'occupancy' not in data:
        return jsonify({'error': 'Missing occupancy value'}), 400
    
    occupancy = data['occupancy']
    # Ensure occupancy is a non-negative integer
    try:
        occupancy = int(occupancy)
        if occupancy < 0:
            return jsonify({'error': 'Occupancy cannot be negative'}), 400
    except ValueError:
        return jsonify({'error': 'Occupancy must be an integer'}), 400
    
    conn = sqlite3.connect('disaster_management.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Check if shelter exists and get capacity
    cursor.execute('SELECT id, capacity FROM shelters WHERE id = ?', (shelter_id,))
    shelter = cursor.fetchone()
    
    if not shelter:
        conn.close()
        return jsonify({'error': 'Shelter not found'}), 404
    
    shelter_dict = dict(shelter)
    
    # Ensure occupancy doesn't exceed capacity
    if occupancy > shelter_dict['capacity']:
        conn.close()
        return jsonify({'error': 'Occupancy cannot exceed capacity'}), 400
    
    # Update occupancy
    cursor.execute('UPDATE shelters SET current_occupancy = ?, updated_at = datetime("now") WHERE id = ?', 
                  (occupancy, shelter_id))
    
    conn.commit()
    
    # Get updated shelter data
    cursor.execute('SELECT * FROM shelters WHERE id = ?', (shelter_id,))
    updated_shelter = dict(cursor.fetchone())
    
    # Get resources for this shelter
    cursor.execute('SELECT id, name, quantity FROM shelter_resources WHERE shelter_id = ?', (shelter_id,))
    shelter_resources = [dict(row) for row in cursor.fetchall()]
    updated_shelter['resources'] = shelter_resources
    
    conn.close()
    
    # Broadcast the updated shelter to connected clients
    socketio.emit('shelter_updated', updated_shelter)
    
    return jsonify({'success': True, 'shelter': updated_shelter})

if __name__ == '__main__':
    socketio.run(app, debug=True)