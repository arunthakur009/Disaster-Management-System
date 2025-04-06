document.addEventListener('DOMContentLoaded', function() {
    // Initialize map
    const map = L.map('map').setView([51.505, -0.09], 13); // Default view, will be updated with user location
    
    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Set up Socket.IO connection
    const socket = io();
    
    // Custom marker icons
    const icons = {
        flood: L.icon({
            iconUrl: '/static/img/flood.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        fire: L.icon({
            iconUrl: '/static/img/fire.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        collapse: L.icon({
            iconUrl: '/static/img/collapse.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        roadblock: L.icon({
            iconUrl: '/static/img/roadblock.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        medical: L.icon({
            iconUrl: '/static/img/medical.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        other: L.icon({
            iconUrl: '/static/img/other.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        sos: L.icon({
            iconUrl: '/static/img/sos.png',
            iconSize: [38, 38],
            iconAnchor: [19, 38],
            popupAnchor: [0, -38]
        }),
        shelter: L.divIcon({
            className: 'custom-div-icon',
            html: '<div class="marker-pin shelter-pin"><i class="fas fa-home"></i></div>',
            iconSize: [30, 42],
            iconAnchor: [15, 42]
        }),
        hospital: L.icon({
            iconUrl: '/static/img/hospital.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        food: L.icon({
            iconUrl: '/static/img/food.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        water: L.icon({
            iconUrl: '/static/img/water.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        volunteer: L.icon({
            iconUrl: '/static/img/volunteer.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        broadcast: L.icon({
            iconUrl: '/static/img/broadcast.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        })
    };
    
    // Storage for map layers
    const layers = {
        incidents: L.layerGroup().addTo(map),
        resources: L.layerGroup().addTo(map),
        sos: L.layerGroup().addTo(map),
        broadcasts: L.layerGroup().addTo(map),
        shelters: L.layerGroup().addTo(map)
    };
    
    // Store incident markers for easy reference
    const incidentMarkers = new Map();
    // Store shelter markers for easy reference
    const shelterMarkers = new Map();
    
    // Variables for report form
    let selectedLocation = null;
    let audioBlob = null;
    let recorder = null;
    
    // Get user's current location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            
            // Center map on user's location
            map.setView([userLat, userLng], 13);
            
            // Add marker for user's location
            L.marker([userLat, userLng], {
                icon: L.icon({
                    iconUrl: '/static/img/user-location.png',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(map)
              .bindPopup('Your Location')
              .openPopup();
            
            // Send location to server
            socket.emit('update_location', {
                latitude: userLat,
                longitude: userLng
            });
            
            // Load incidents and resources near the user
            loadIncidents();
            loadResources();
            loadShelters();
        }, function() {
            // If geolocation fails, use default location
            loadIncidents();
            loadResources();
            loadShelters();
        });
    } else {
        // If geolocation not supported, use default location
        loadIncidents();
        loadResources();
        loadShelters();
    }
    
    // Load incidents from API
    function loadIncidents() {
        fetch('/api/incidents')
            .then(response => response.json())
            .then(incidents => {
                layers.incidents.clearLayers();
                incidents.forEach(addIncidentToMap);
            })
            .catch(error => console.error('Error loading incidents:', error));
    }
    
    // Add incident to map
    function addIncidentToMap(incident) {
        const lat = parseFloat(incident.latitude);
        const lng = parseFloat(incident.longitude);
        const icon = icons[incident.type] || icons.other;
        
        const marker = L.marker([lat, lng], { icon }).addTo(layers.incidents);
        
        // Create popup content
        const template = document.getElementById('incident-popup-template').innerHTML;
        const popupContent = template
            .replace(/{type}/g, capitalize(incident.type))
            .replace(/{description}/g, incident.description || 'No description provided')
            .replace(/{time}/g, formatDate(incident.reported_at))
            .replace(/{urgency}/g, incident.urgency || 'medium')
            .replace(/{verification_count}/g, incident.verification_count || 0)
            .replace(/{id}/g, incident.id)
            .replace(/{latitude}/g, lat)
            .replace(/{longitude}/g, lng)
            .replace(/{image_path}/g, incident.image_path ? '/' + incident.image_path : '')
            .replace(/{image_display}/g, incident.image_path ? 'block' : 'none');
        
        marker.bindPopup(popupContent);
        
        // Store the marker in a Map to access it later for updates
        incidentMarkers.set(incident.id, marker);
        
        // Add pulse effect for high urgency incidents
        if (incident.urgency === 'high') {
            L.circle([lat, lng], {
                color: '#e74c3c',
                fillColor: '#e74c3c',
                fillOpacity: 0.2,
                radius: 200
            }).addTo(layers.incidents);
        }
    }
    
    // Load resources from API
    function loadResources() {
        fetch('/api/resources')
            .then(response => response.json())
            .then(resources => {
                layers.resources.clearLayers();
                resources.forEach(addResourceToMap);
            })
            .catch(error => console.error('Error loading resources:', error));
    }
    
    // Add resource to map
    function addResourceToMap(resource) {
        const lat = parseFloat(resource.latitude);
        const lng = parseFloat(resource.longitude);
        const icon = icons[resource.type] || icons.other;
        
        const marker = L.marker([lat, lng], { icon }).addTo(layers.resources);
        
        // Create popup content
        const template = document.getElementById('resource-popup-template').innerHTML;
        const popupContent = template
            .replace(/{name}/g, resource.name)
            .replace(/{description}/g, resource.description || 'No description provided')
            .replace(/{type}/g, capitalize(resource.type))
            .replace(/{contact}/g, resource.contact || 'No contact information')
            .replace(/{capacity}/g, resource.capacity || 'Unknown')
            .replace(/{status}/g, resource.status || 'operational')
            .replace(/{latitude}/g, lat)
            .replace(/{longitude}/g, lng);
        
        marker.bindPopup(popupContent);
    }
    
    // Load shelters from API
    function loadShelters() {
        fetch('/api/shelters')
            .then(response => response.json())
            .then(shelters => {
                layers.shelters.clearLayers();
                shelters.forEach(addShelterToMap);
            })
            .catch(error => console.error('Error loading shelters:', error));
    }
    
    // Add shelter to map
    function addShelterToMap(shelter) {
        const lat = parseFloat(shelter.latitude);
        const lng = parseFloat(shelter.longitude);
        const icon = icons.shelter;
        
        const marker = L.marker([lat, lng], { icon }).addTo(layers.shelters);
        
        // Create resource tags HTML
        let resourceTagsHtml = '<p class="no-resources">No resources available</p>';
        if (shelter.resources && shelter.resources.length > 0) {
            resourceTagsHtml = shelter.resources.map(resource => 
                `<span class="resource-tag">${resource.name} (${resource.quantity})</span>`
            ).join('');
        }
        
        // Create popup content
        const template = document.getElementById('shelter-popup-template').innerHTML;
        const popupContent = template
            .replace(/{name}/g, shelter.name)
            .replace(/{description}/g, shelter.description || 'No description provided')
            .replace(/{capacity}/g, shelter.capacity || 'Unknown')
            .replace(/{contact}/g, shelter.contact || 'No contact information')
            .replace(/{status}/g, shelter.status || 'operational')
            .replace(/{latitude}/g, lat)
            .replace(/{longitude}/g, lng)
            .replace(/{resources_tags}/g, resourceTagsHtml);
        
        marker.bindPopup(popupContent);
        
        // Store the marker in a Map to access it later for updates
        shelterMarkers.set(shelter.id, marker);
        
        // Add visual indicator for shelter status
        const statusColors = {
            'operational': '#2ecc71',
            'limited': '#f39c12',
            'full': '#e74c3c'
        };
        
        const color = statusColors[shelter.status] || '#2ecc71';
        
        L.circle([lat, lng], {
            color: color,
            fillColor: color,
            fillOpacity: 0.2,
            radius: 100
        }).addTo(layers.shelters);
    }
    
    // Filter button event
    document.getElementById('apply-filters').addEventListener('click', function() {
        const incidentType = document.getElementById('incident-type').value;
        const urgency = document.getElementById('urgency').value;
        const timeReported = document.getElementById('time-reported').value;
        
        let url = '/api/incidents?';
        if (incidentType) url += `type=${incidentType}&`;
        if (urgency) url += `urgency=${urgency}&`;
        if (timeReported) {
            const now = new Date();
            let hours = 24;
            if (timeReported === '1h') hours = 1;
            if (timeReported === '6h') hours = 6;
            const timeFrom = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
            url += `time_from=${timeFrom}&`;
        }
        
        fetch(url)
            .then(response => response.json())
            .then(incidents => {
                layers.incidents.clearLayers();
                incidents.forEach(addIncidentToMap);
            })
            .catch(error => console.error('Error filtering incidents:', error));
        
        // Filter resources
        const resourceCheckboxes = document.querySelectorAll('.checkbox-group input:checked');
        const resourceTypes = Array.from(resourceCheckboxes).map(cb => cb.value);
        
        layers.resources.eachLayer(layer => {
            const resourceType = layer.feature && layer.feature.properties && layer.feature.properties.type;
            if (resourceType && !resourceTypes.includes(resourceType)) {
                layers.resources.removeLayer(layer);
            }
        });
    });
    
    // Map click event for selecting location
    map.on('click', function(e) {
        selectedLocation = e.latlng;
        const locationText = `Lat: ${selectedLocation.lat.toFixed(6)}, Lng: ${selectedLocation.lng.toFixed(6)}`;
        
        // Update both location displays
        document.getElementById('selected-location').textContent = locationText;
        document.getElementById('shelter-location').textContent = locationText;
        
        // Enable both submit buttons
        document.getElementById('submit-report').removeAttribute('disabled');
        document.getElementById('submit-shelter').removeAttribute('disabled');
    });
    
    // Audio recording
    const startRecordingBtn = document.getElementById('start-recording');
    const stopRecordingBtn = document.getElementById('stop-recording');
    const audioPreview = document.getElementById('audio-preview');
    
    startRecordingBtn.addEventListener('click', function() {
        // Check if MediaRecorder is supported
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function(stream) {
                    startRecordingBtn.setAttribute('disabled', true);
                    stopRecordingBtn.removeAttribute('disabled');
                    
                    // Create new MediaRecorder
                    recorder = new MediaRecorder(stream);
                    const chunks = [];
                    
                    recorder.addEventListener('dataavailable', function(e) {
                        chunks.push(e.data);
                    });
                    
                    recorder.addEventListener('stop', function() {
                        audioBlob = new Blob(chunks, { type: 'audio/webm' });
                        audioPreview.src = URL.createObjectURL(audioBlob);
                        audioPreview.style.display = 'block';
                    });
                    
                    recorder.start();
                })
                .catch(function(err) {
                    console.error('Error accessing microphone:', err);
                    alert('Could not access microphone. Please check permissions.');
                });
        } else {
            alert('Audio recording is not supported in your browser.');
        }
    });
    
    stopRecordingBtn.addEventListener('click', function() {
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
            startRecordingBtn.removeAttribute('disabled');
            stopRecordingBtn.setAttribute('disabled', true);
        }
    });
    
    // Submit incident report
    document.getElementById('incident-form').addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!selectedLocation) {
            alert('Please select a location on the map.');
            return;
        }
        
        const formData = new FormData();
        formData.append('type', document.getElementById('report-type').value);
        formData.append('description', document.getElementById('report-description').value);
        formData.append('latitude', selectedLocation.lat);
        formData.append('longitude', selectedLocation.lng);
        formData.append('urgency', document.getElementById('report-urgency').value);
        
        // Add image file if selected
        const imageInput = document.getElementById('report-image');
        if (imageInput && imageInput.files.length > 0) {
            formData.append('image', imageInput.files[0]);
        }
        
        if (audioBlob) {
            formData.append('audio', audioBlob, 'report-audio.webm');
        }
        
        fetch('/api/incidents', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            // Add the new incident to the map
            addIncidentToMap(data);
            
            // Reset form
            document.getElementById('incident-form').reset();
            audioPreview.style.display = 'none';
            audioPreview.src = '';
            audioBlob = null;
            selectedLocation = null;
            document.getElementById('selected-location').textContent = 'No location selected';
            document.getElementById('submit-report').setAttribute('disabled', true);
            
            // Show confirmation dialog
            if (typeof showReportConfirmation === 'function') {
                showReportConfirmation(data);
            } else {
                // Fallback if the function isn't defined
            alert('Incident reported successfully!');
            }
        })
        .catch(error => {
            console.error('Error submitting report:', error);
            alert('Failed to submit report. Please try again.');
        });
    });
    
    // Add shelter submission handler
    document.getElementById('shelter-form').addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!selectedLocation) {
            alert('Please select a location on the map.');
            return;
        }
        
        const shelterData = {
            name: document.getElementById('shelter-name').value,
            description: document.getElementById('shelter-description').value,
            capacity: document.getElementById('shelter-capacity').value,
            contact: document.getElementById('shelter-contact').value,
            status: document.getElementById('shelter-status').value,
            latitude: selectedLocation.lat,
            longitude: selectedLocation.lng,
            resources: window.shelterResources || [] // Include resources
        };
        
        // Send shelter data to server
        fetch('/api/shelters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(shelterData)
        })
        .then(response => response.json())
        .then(data => {
            console.log('Shelter added successfully:', data);
            
            // Add the shelter to the map
            addShelterToMap({
                id: data.id || Date.now(), // Use returned ID or timestamp as fallback
                ...shelterData
            });
            
            // Reset form and selected location
            document.getElementById('shelter-form').reset();
            document.getElementById('resources-list').innerHTML = ''; // Clear resources list
            window.shelterResources = []; // Reset resources array
            selectedLocation = null;
            document.getElementById('shelter-location').textContent = 'Click on map to select location';
            document.getElementById('submit-shelter').setAttribute('disabled', true);
            
            // Show confirmation card instead of alert
            const shelterConfirmation = document.getElementById('shelter-confirmation');
            const shelterSummaryList = document.getElementById('shelter-summary-list');
            
            // Clear previous summary
            shelterSummaryList.innerHTML = '';
            
            // Add shelter details to summary
            const nameItem = document.createElement('li');
            nameItem.innerHTML = `<strong>Name:</strong> ${shelterData.name}`;
            shelterSummaryList.appendChild(nameItem);
            
            const capacityItem = document.createElement('li');
            capacityItem.innerHTML = `<strong>Capacity:</strong> ${shelterData.capacity}`;
            shelterSummaryList.appendChild(capacityItem);
            
            const statusItem = document.createElement('li');
            statusItem.innerHTML = `<strong>Status:</strong> ${shelterData.status.charAt(0).toUpperCase() + shelterData.status.slice(1)}`;
            shelterSummaryList.appendChild(statusItem);
            
            const locationItem = document.createElement('li');
            locationItem.innerHTML = `<strong>Location:</strong> Lat: ${parseFloat(shelterData.latitude).toFixed(6)}, Lng: ${parseFloat(shelterData.longitude).toFixed(6)}`;
            shelterSummaryList.appendChild(locationItem);
            
            const idItem = document.createElement('li');
            idItem.innerHTML = `<strong>ID:</strong> ${data.id || 'pending'}`;
            shelterSummaryList.appendChild(idItem);
            
            // Show the confirmation card
            shelterConfirmation.style.display = 'flex';
        })
        .catch(error => {
            console.error('Error adding shelter:', error);
            alert('Failed to add shelter. Please try again.');
        });
    });
    
    // Helper functions
    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleString();
    }
    
    function generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
    
    function getIncidentIconHTML(type, urgency) {
        // Return appropriate icon HTML based on type and urgency
        let iconClass = 'fas fa-exclamation-triangle';
        if (type === 'fire') iconClass = 'fas fa-fire';
        else if (type === 'flood') iconClass = 'fas fa-water';
        else if (type === 'collapse') iconClass = 'fas fa-building';
        else if (type === 'roadblock') iconClass = 'fas fa-road';
        else if (type === 'medical') iconClass = 'fas fa-first-aid';
        
        return `<i class="${iconClass} urgency-${urgency}"></i>`;
    }
    
    function getResourceIconHTML(type, status) {
        // Return appropriate icon HTML based on type and status
        let iconClass = 'fas fa-box-open';
        if (type === 'shelter') iconClass = 'fas fa-home';
        else if (type === 'hospital') iconClass = 'fas fa-hospital';
        else if (type === 'food') iconClass = 'fas fa-utensils';
        else if (type === 'water') iconClass = 'fas fa-tint';
        else if (type === 'volunteer') iconClass = 'fas fa-hands-helping';
        
        return `<i class="${iconClass} status-${status}"></i>`;
    }
    
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    function formatIncidentType(type) {
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    function formatResourceType(type) {
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    // Dashboard functionality
    let incidents = [];
    let resources = [];
    
    function updateIncidentList(incidents) {
        const incidentListElement = document.getElementById('recent-incidents');
        if (!incidentListElement) return;
        
        incidentListElement.innerHTML = '';
        
        incidents.forEach(incident => {
            const incidentItem = document.createElement('div');
            incidentItem.className = `incident-item urgency-${incident.urgency}`;
            
            incidentItem.innerHTML = `
                <div class="incident-icon">
                    ${getIncidentIconHTML(incident.type, incident.urgency)}
                </div>
                <div class="incident-details">
                    <h4>${formatIncidentType(incident.type)}</h4>
                    <p>${incident.description}</p>
                    <div class="meta-data">
                        <span><i class="fas fa-map-marker-alt"></i> ${incident.location}</span>
                        <span><i class="far fa-clock"></i> ${formatTime(incident.time)}</span>
                    </div>
                </div>
                <div class="incident-actions">
                    <button class="btn small" onclick="viewIncidentOnMap(${incident.id})">
                        <i class="fas fa-map"></i> View
                    </button>
                    <button class="btn small" onclick="respondToIncident(${incident.id})">
                        <i class="fas fa-reply"></i> Respond
                    </button>
                </div>
            `;
            
            incidentListElement.appendChild(incidentItem);
        });
    }
    
    function updateSOSList(sosAlerts) {
        const sosListElement = document.getElementById('active-sos');
        if (!sosListElement) return;
        
        sosListElement.innerHTML = '';
        
        sosAlerts.forEach(sos => {
            const sosItem = document.createElement('div');
            sosItem.className = 'sos-item';
            
            sosItem.innerHTML = `
                <div class="sos-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="sos-details">
                    <h4>SOS Alert</h4>
                    <p>User: ${sos.user}</p>
                    <div class="meta-data">
                        <span><i class="fas fa-map-marker-alt"></i> ${sos.location}</span>
                        <span><i class="far fa-clock"></i> ${formatTime(sos.time)}</span>
                    </div>
                </div>
                <div class="sos-actions">
                    <button class="btn small primary" onclick="viewSOSOnMap(${sos.id})">
                        <i class="fas fa-map"></i> Locate
                    </button>
                    <button class="btn small" onclick="contactUser(${sos.id})">
                        <i class="fas fa-phone"></i> Contact
                    </button>
                </div>
            `;
            
            sosListElement.appendChild(sosItem);
        });
    }
    
    function updateBroadcastList(broadcasts) {
        const broadcastListElement = document.getElementById('recent-broadcasts');
        if (!broadcastListElement) return;
        
        broadcastListElement.innerHTML = '';
        
        broadcasts.forEach(broadcast => {
            const broadcastItem = document.createElement('div');
            broadcastItem.className = 'broadcast-item';
            
            broadcastItem.innerHTML = `
                <div class="broadcast-icon">
                    <i class="fas fa-broadcast-tower"></i>
                </div>
                <div class="broadcast-details">
                    <h4>Emergency Broadcast</h4>
                    <p>${broadcast.message}</p>
                    <div class="meta-data">
                        <span><i class="fas fa-user"></i> ${broadcast.sender}</span>
                        <span><i class="fas fa-broadcast-tower"></i> ${broadcast.radius}km radius</span>
                        <span><i class="far fa-clock"></i> ${formatTime(broadcast.time)}</span>
                    </div>
                </div>
                <div class="broadcast-actions">
                    <button class="btn small" onclick="viewBroadcastOnMap(${broadcast.id})">
                        <i class="fas fa-map"></i> View Area
                    </button>
                </div>
            `;
            
            broadcastListElement.appendChild(broadcastItem);
        });
    }
    
    function updateResourceList(resources) {
        const resourceListElement = document.getElementById('resources-list');
        if (!resourceListElement) return;
        
        resourceListElement.innerHTML = '';
        
        resources.forEach(resource => {
            const resourceItem = document.createElement('div');
            resourceItem.className = `resource-item status-${resource.status}`;
            
            resourceItem.innerHTML = `
                <div class="resource-icon">
                    ${getResourceIconHTML(resource.type, resource.status)}
                </div>
                <div class="resource-details">
                    <h4>${resource.name}</h4>
                    <p>${resource.description}</p>
                    <div class="meta-data">
                        <span><i class="fas fa-map-marker-alt"></i> ${resource.location}</span>
                        <span><i class="fas fa-users"></i> Capacity: ${resource.capacity}</span>
                        <span><i class="fas fa-phone"></i> ${resource.contact}</span>
                    </div>
                </div>
                <div class="resource-actions">
                    <button class="btn small" onclick="viewResourceOnMap(${resource.id})">
                        <i class="fas fa-map"></i> View
                    </button>
                    <button class="btn small" onclick="updateResourceStatus(${resource.id})">
                        <i class="fas fa-edit"></i> Update
                    </button>
                </div>
            `;
            
            resourceListElement.appendChild(resourceItem);
        });
    }
    
    function sendBroadcast() {
        // Get form values
        const message = document.getElementById('broadcast-message').value;
        const radius = parseInt(document.getElementById('broadcast-radius').value);
        const locationType = document.querySelector('input[name="location-type"]:checked').value;
        
        let latitude, longitude;
        
        if (locationType === 'current') {
            // Get current location
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function(position) {
                        latitude = position.coords.latitude;
                        longitude = position.coords.longitude;
                        completeBroadcast(message, radius, latitude, longitude);
                    },
                    function(error) {
                        console.error('Error getting location:', error);
                        alert('Unable to get your location. Please try again or use custom location.');
                    }
                );
            } else {
                alert('Geolocation is not supported by your browser. Please use custom location.');
            }
        } else if (locationType === 'custom') {
            // Get custom location
            latitude = parseFloat(document.getElementById('broadcast-latitude').value);
            longitude = parseFloat(document.getElementById('broadcast-longitude').value);
            completeBroadcast(message, radius, latitude, longitude);
        }
    }
    
    function completeBroadcast(message, radius, latitude, longitude) {
        // Create broadcast object
        const broadcast = {
            id: generateId(),
            message: message,
            radius: radius,
            latitude: latitude,
            longitude: longitude,
            sender: 'Emergency Services', // This would come from your auth system
            time: new Date().toISOString()
        };
        
        // Emit broadcast via socket
        socket.emit('broadcast', broadcast);
        
        // Show notification
        const broadcastArea = document.createElement('div');
        broadcastArea.className = 'broadcast-area';
        broadcastArea.style.left = 'calc(50% - ' + (radius * 20) + 'px)';
        broadcastArea.style.top = 'calc(50% - ' + (radius * 20) + 'px)';
        broadcastArea.style.width = (radius * 40) + 'px';
        broadcastArea.style.height = (radius * 40) + 'px';
        document.body.appendChild(broadcastArea);
        
        // Remove after animation
        setTimeout(() => {
            broadcastArea.remove();
        }, 2000);
        
        // Reset form
        document.getElementById('broadcast-form').reset();
        
        // Show confirmation
        alert(`Emergency broadcast sent to all users within ${radius}km radius.`);
    }
    
    function addResource() {
        // Get form values
        const type = document.getElementById('resource-type').value;
        const name = document.getElementById('resource-name').value;
        const description = document.getElementById('resource-description').value;
        const capacity = parseInt(document.getElementById('resource-capacity').value);
        const contact = document.getElementById('resource-contact').value;
        const status = document.getElementById('resource-status').value;
        const locationType = document.querySelector('input[name="resource-location-type"]:checked').value;
        
        let latitude, longitude, locationName;
        
        if (locationType === 'current') {
            // Get current location and address
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function(position) {
                        latitude = position.coords.latitude;
                        longitude = position.coords.longitude;
                        
                        // Reverse geocode to get address (in a real app)
                        // For demonstration, we'll use coordinates as location name
                        locationName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
                        
                        completeAddResource(type, name, description, capacity, contact, status, latitude, longitude, locationName);
                    },
                    function(error) {
                        console.error('Error getting location:', error);
                        alert('Unable to get your location. Please try again or use custom location.');
                    }
                );
            } else {
                alert('Geolocation is not supported by your browser. Please use custom location.');
            }
        } else if (locationType === 'custom') {
            // Get custom location
            latitude = parseFloat(document.getElementById('resource-latitude').value);
            longitude = parseFloat(document.getElementById('resource-longitude').value);
            locationName = document.getElementById('resource-location-name').value;
            
            completeAddResource(type, name, description, capacity, contact, status, latitude, longitude, locationName);
        }
    }
    
    function completeAddResource(type, name, description, capacity, contact, status, latitude, longitude, locationName) {
        // Create resource object
        const resource = {
            id: generateId(),
            type: type,
            name: name,
            description: description,
            capacity: capacity,
            status: status,
            contact: contact,
            latitude: latitude,
            longitude: longitude,
            location: locationName
        };
        
        // Emit resource via socket
        socket.emit('new_resource', resource);
        
        // Add to our local data and map
        resources.push(resource);
        addResourceToMap(resource);
        
        // Reset form
        document.getElementById('resource-form').reset();
        
        // Show confirmation
        alert('Resource added successfully. Users can now see this on their maps.');
    }
    
    // Map interaction functions for dashboard
    function viewIncidentOnMap(incidentId) {
        const incident = incidents.find(inc => inc.id === incidentId);
        if (incident && incident.latitude && incident.longitude) {
            map.setView([incident.latitude, incident.longitude], 16);
            if (incident.marker) {
                incident.marker.openPopup();
            }
        }
    }
    
    function respondToIncident(incidentId) {
        const incident = incidents.find(inc => inc.id === incidentId);
        if (incident) {
            // In a real app, this would open a response form or initiate a response protocol
            alert(`Responding to incident ${incidentId}. Notifying field teams.`);
        }
    }
    
    function viewSOSOnMap(sosId) {
        // In a real app, you would find the SOS by ID and pan to it
        alert(`Locating SOS alert ${sosId}. Dispatching emergency services.`);
    }
    
    function contactUser(sosId) {
        // In a real app, this would open a communication channel with the user
        alert(`Initiating contact with user who sent SOS alert ${sosId}.`);
    }
    
    function viewBroadcastOnMap(broadcastId) {
        // In a real app, you would find the broadcast by ID and show its radius on the map
        alert(`Showing broadcast area for broadcast ${broadcastId}.`);
    }
    
    function viewResourceOnMap(resourceId) {
        const resource = resources.find(res => res.id === resourceId);
        if (resource && resource.latitude && resource.longitude) {
            map.setView([resource.latitude, resource.longitude], 16);
            if (resource.marker) {
                resource.marker.openPopup();
            }
        }
    }
    
    function updateResourceStatus(resourceId) {
        const resource = resources.find(res => res.id === resourceId);
        if (resource) {
            // In a real app, this would open a status update form
            const newStatus = prompt("Update resource status (available, limited, unavailable):", resource.status);
            if (newStatus && ['available', 'limited', 'unavailable'].includes(newStatus)) {
                resource.status = newStatus;
                
                // Update on map
                if (resource.marker) {
                    map.removeLayer(resource.marker);
                    addResourceToMap(resource);
                }
                
                // Emit update via socket
                socket.emit('update_resource', resource);
                
                alert(`Resource status updated to ${newStatus}.`);
            }
        }
    }
    
    // Analytics and Statistics Functions
    function updateStatistics() {
        // Count incidents by type
        const incidentTypes = {};
        incidents.forEach(incident => {
            incidentTypes[incident.type] = (incidentTypes[incident.type] || 0) + 1;
        });
        
        // Count resources by type
        const resourceTypes = {};
        resources.forEach(resource => {
            resourceTypes[resource.type] = (resourceTypes[resource.type] || 0) + 1;
        });
        
        // Count incidents by urgency
        const urgencyLevels = {
            high: 0,
            medium: 0,
            low: 0
        };
        incidents.forEach(incident => {
            urgencyLevels[incident.urgency]++;
        });
        
        // Update statistics display
        updateStatisticsDisplay(incidentTypes, resourceTypes, urgencyLevels);
        
        // Update charts
        updateIncidentTypeChart(incidentTypes);
        updateUrgencyChart(urgencyLevels);
        updateResourceChart(resourceTypes);
    }
    
        
    function updateStatisticsDisplay(incidentTypes, resourceTypes, urgencyLevels) {
        // Update incident type counts
        Object.keys(incidentTypes).forEach(type => {
            const element = document.getElementById(`${type}-count`);
            if (element) {
                element.textContent = incidentTypes[type];
            }
        });
        
        // Update urgency counts
        Object.keys(urgencyLevels).forEach(level => {
            const element = document.getElementById(`${level}-urgency-count`);
            if (element) {
                element.textContent = urgencyLevels[level];
            }
        });
        
        // Update resource type counts
        Object.keys(resourceTypes).forEach(type => {
            const element = document.getElementById(`${type}-resource-count`);
            if (element) {
                element.textContent = resourceTypes[type];
            }
        });
    }
    
    function updateIncidentTypeChart(incidentTypes) {
        // Create data for chart
        const labels = Object.keys(incidentTypes).map(type => formatIncidentType(type));
        const data = Object.values(incidentTypes);
        
        // Get chart context
        const ctx = document.getElementById('incident-type-chart');
        if (!ctx) return;
        
        // Create chart
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#3498db', // blue
                        '#e74c3c', // red
                        '#f1c40f', // yellow
                        '#2ecc71', // green
                        '#9b59b6', // purple
                        '#e67e22'  // orange
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                legend: {
                    position: 'right'
                }
            }
        });
    }
    
    function updateUrgencyChart(urgencyLevels) {
        // Create data for chart
        const labels = Object.keys(urgencyLevels).map(level => level.charAt(0).toUpperCase() + level.slice(1));
        const data = Object.values(urgencyLevels);
        
        // Get chart context
        const ctx = document.getElementById('urgency-chart');
        if (!ctx) return;
        
        // Create chart
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Incidents by Urgency',
                    data: data,
                    backgroundColor: [
                        '#e74c3c', // red for high
                        '#f39c12', // orange for medium
                        '#3498db'  // blue for low
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    yAxes: [{
                        ticks: {
                            beginAtZero: true,
                            stepSize: 1
                        }
                    }]
                }
            }
        });
    }
    
    function updateResourceChart(resourceTypes) {
        // Create data for chart
        const labels = Object.keys(resourceTypes).map(type => formatResourceType(type));
        const data = Object.values(resourceTypes);
        
        // Get chart context
        const ctx = document.getElementById('resource-chart');
        if (!ctx) return;
        
        // Create chart
        new Chart(ctx, {
            type: 'horizontalBar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Available Resources',
                    data: data,
                    backgroundColor: '#2ecc71' // green
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    xAxes: [{
                        ticks: {
                            beginAtZero: true,
                            stepSize: 1
                        }
                    }]
                }
            }
        });
    }
    
    // Mobile-specific optimizations
    function setupMobileUI() {
        // Handle menu toggle
        const menuToggle = document.getElementById('menu-toggle');
        const sidePanel = document.getElementById('side-panel');
        
        if (menuToggle && sidePanel) {
            menuToggle.addEventListener('click', function() {
                sidePanel.classList.toggle('open');
            });
        }
        
        // Close side panel when map is clicked on mobile
        if (typeof map !== 'undefined') {
            map.on('click', function() {
                if (window.innerWidth < 768 && sidePanel && sidePanel.classList.contains('open')) {
                    sidePanel.classList.remove('open');
                }
            });
        }
        
        // Add swipe gestures for mobile
        document.addEventListener('touchstart', handleTouchStart, false);
        document.addEventListener('touchmove', handleTouchMove, false);
    }
    
    let xDown = null;
    let yDown = null;
    
    function handleTouchStart(evt) {
        xDown = evt.touches[0].clientX;
        yDown = evt.touches[0].clientY;
    }
    
    function handleTouchMove(evt) {
        if (!xDown || !yDown) {
            return;
        }
        
        const sidePanel = document.getElementById('side-panel');
        if (!sidePanel) return;
        
        let xUp = evt.touches[0].clientX;
        let yUp = evt.touches[0].clientY;
        
        let xDiff = xDown - xUp;
        let yDiff = yDown - yUp;
        
        if (Math.abs(xDiff) > Math.abs(yDiff)) {
            if (xDiff > 0) {
                // Swipe left - close panel
                sidePanel.classList.remove('open');
            } else {
                // Swipe right - open panel
                sidePanel.classList.add('open');
            }
        }
        
        xDown = null;
        yDown = null;
    }
    
    // Ensure formatIncidentType and formatResourceType functions exist
    function formatIncidentType(type) {
        // Capitalize first letter and replace hyphens with spaces
        if (!type) return 'Unknown';
        return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ');
    }
    
    function formatResourceType(type) {
        // Capitalize first letter and replace hyphens with spaces
        if (!type) return 'Unknown';
        return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ');
    }
    
    // Initialize mobile UI if screen is small
    if (window.innerWidth < 768) {
        setupMobileUI();
    }
    
    // Listen for window resize to handle responsive UI
    window.addEventListener('resize', function() {
        if (window.innerWidth < 768) {
            setupMobileUI();
        }
    });
    
    // Ensure updateStatistics function exists
    function updateStatistics() {
        // If function is not defined in the main code, provide a basic implementation
        if (typeof incidents === 'undefined' || typeof resources === 'undefined') {
            console.warn('Statistics data not available');
            return;
        }
        
        // Count incidents by type
        const incidentTypes = {};
        incidents.forEach(incident => {
            incidentTypes[incident.type] = (incidentTypes[incident.type] || 0) + 1;
        });
        
        // Count resources by type
        const resourceTypes = {};
        resources.forEach(resource => {
            resourceTypes[resource.type] = (resourceTypes[resource.type] || 0) + 1;
        });
        
        // Count incidents by urgency
        const urgencyLevels = {
            high: 0,
            medium: 0,
            low: 0
        };
        incidents.forEach(incident => {
            if (incident.urgency) {
                urgencyLevels[incident.urgency]++;
            }
        });
        
        // Update statistics display
        updateStatisticsDisplay(incidentTypes, resourceTypes, urgencyLevels);
        
        // Update charts
        updateIncidentTypeChart(incidentTypes);
        updateUrgencyChart(urgencyLevels);
        updateResourceChart(resourceTypes);
    }
    
        // Call update statistics when page loads (moved inside DOMContentLoaded to ensure DOM is ready)
        document.addEventListener('DOMContentLoaded', function() {
            if (document.getElementById('statistics-panel')) {
                updateStatistics();
            }
        });
    
    // Listen for map popup opens to attach direction button handlers
    map.on('popupopen', function(e) {
        // Check if popup has direction buttons and attach click handlers
        const directionButtons = e.popup._contentNode.querySelectorAll('.directions-button');
        
        directionButtons.forEach(button => {
            // Remove existing event listeners to prevent duplicates
            button.replaceWith(button.cloneNode(true));
            
            // Get the new button (after cloning)
            const newButton = e.popup._contentNode.querySelector(`[data-lat="${button.getAttribute('data-lat')}"][data-lng="${button.getAttribute('data-lng')}"]`);
            
            if (newButton) {
                newButton.addEventListener('click', function() {
                    const targetLat = parseFloat(this.getAttribute('data-lat'));
                    const targetLng = parseFloat(this.getAttribute('data-lng'));
                    
                    if (isNaN(targetLat) || isNaN(targetLng)) {
                        console.error('Invalid coordinates for directions');
                        return;
                    }
                    
                    console.log(`Getting directions to: ${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}`);
                    
                    // Show loading state
                    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
                    
                    // Get user's current location
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            position => {
                                const userLat = position.coords.latitude;
                                const userLng = position.coords.longitude;
                                
                                // Create directions URL for Google Maps
                                const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${targetLat},${targetLng}&travelmode=driving`;
                                
                                // Open in a new tab
                                window.open(googleMapsUrl, '_blank');
                                
                                // Restore button
                                this.innerHTML = '<i class="fas fa-directions"></i> Directions';
                            },
                            error => {
                                console.error('Error getting user location:', error);
                                
                                // Still provide directions but without origin
                                const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}&travelmode=driving`;
                                window.open(googleMapsUrl, '_blank');
                                
                                // Restore button
                                this.innerHTML = '<i class="fas fa-directions"></i> Directions';
                            }
                        );
                    } else {
                        // Fallback if geolocation is not supported
                        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLng}`;
                        window.open(googleMapsUrl, '_blank');
                        
                        // Restore button
                        this.innerHTML = '<i class="fas fa-directions"></i> Directions';
                    }
                });
            }
        });
    });
    
    // Socket.IO event listener for incident verification updates
    socket.on('incident_verified', function(data) {
        console.log('Received incident verification update:', data);
        
        // Get the marker for this incident
        const marker = incidentMarkers.get(data.incident_id);
        if (marker) {
            // Get current popup content
            const popupContent = marker.getPopup().getContent();
            
            // Update verification count in popup content
            const updatedContent = popupContent.replace(
                /Verified by:<\/strong> \d+ users/,
                `Verified by:</strong> ${data.verification_count} users`
            );
            
            // Update the popup content
            marker.getPopup().setContent(updatedContent);
            
            // If popup is open, update it
            if (marker.isPopupOpen()) {
                marker.getPopup().update();
            }
        }
    });

    // Resource functionality for shelter form
    setupResourceInputs();
});

// Setup resource input functionality
function setupResourceInputs() {
    const resourceInputs = document.querySelector('.resource-inputs');
    const resourcesList = document.getElementById('resources-list');
    const addResourceBtn = document.querySelector('.add-resource-btn');
    const nameInput = document.querySelector('.resource-name');
    const quantityInput = document.querySelector('.resource-quantity');
    
    // Store added resources
    window.shelterResources = [];
    
    // Add resource function
    function addResourceFromInputs() {
        const name = nameInput.value.trim();
        const quantity = parseInt(quantityInput.value);
        
        if (name && quantity > 0) {
            // Add to resources list
            addResourceToList(name, quantity);
            
            // Clear inputs
            nameInput.value = '';
            quantityInput.value = '1';
            nameInput.focus();
        }
    }
    
    // Add resource button click handler
    addResourceBtn.addEventListener('click', addResourceFromInputs);
    
    // Add resource on enter key in inputs
    nameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission
            addResourceFromInputs();
        }
    });
    
    quantityInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission
            addResourceFromInputs();
        }
    });
    
    // Function to add resource to the list
    function addResourceToList(name, quantity) {
        // Add to our resources array
        const resourceId = Date.now();
        window.shelterResources.push({
            id: resourceId,
            name: name,
            quantity: quantity
        });
        
        // Create tag element
        const tag = document.createElement('span');
        tag.className = 'resource-tag';
        tag.innerHTML = `${name} (${quantity}) <i class="fas fa-times remove-resource" data-id="${resourceId}"></i>`;
        
        // Add to DOM
        resourcesList.appendChild(tag);
        
        // Add remove handler
        tag.querySelector('.remove-resource').addEventListener('click', function() {
            const id = parseInt(this.getAttribute('data-id'));
            
            // Remove from array
            window.shelterResources = window.shelterResources.filter(r => r.id !== id);
            
            // Remove from DOM
            tag.remove();
        });
    }
}