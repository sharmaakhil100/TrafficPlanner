let map;
let markers = [];
let locations = [];
let autocomplete;
let userLocation = null;

function initMap() {
    // Initialize map centered on a default location (e.g., US)
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 37.0902, lng: -95.7129 },
        zoom: 4,
        styles: [
            {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            }
        ]
    });

    // Request user's location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    name: 'Current Location',
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };

                // Center map on user's location
                map.setCenter({ lat: userLocation.lat, lng: userLocation.lng });
                map.setZoom(13);

                // Add marker for user's location
                const marker = new google.maps.Marker({
                    position: { lat: userLocation.lat, lng: userLocation.lng },
                    map: map,
                    title: 'Your Location',
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: '#4285F4',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                    }
                });

                // Reverse geocode to get address
                const geocoder = new google.maps.Geocoder();
                geocoder.geocode({ location: userLocation }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        userLocation.name = results[0].formatted_address;
                        locations.push(userLocation);
                        updateLocationsList();
                    }
                });
            },
            (error) => {
                console.error('Error getting location:', error);
                alert('Unable to get your location. Please enter it manually.');
            }
        );
    }

    // Initialize Places Autocomplete
    const input = document.getElementById('location-input');
    autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.bindTo('bounds', map);
}

function addLocation() {
    const input = document.getElementById('location-input');
    const place = autocomplete.getPlace();
    
    if (!place || !place.geometry) {
        alert('Please select a location from the dropdown.');
        return;
    }

    const location = {
        name: place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng()
    };

    locations.push(location);
    addMarker(location);
    updateLocationsList();
    input.value = '';

    // Adjust map bounds to show all markers
    const bounds = new google.maps.LatLngBounds();
    markers.forEach(marker => bounds.extend(marker.getPosition()));
    map.fitBounds(bounds);
}

function addMarker(location) {
    const marker = new google.maps.Marker({
        position: { lat: location.lat, lng: location.lng },
        map: map,
        title: location.name,
        label: (markers.length + 1).toString()
    });
    markers.push(marker);
}

function removeLocation(index) {
    locations.splice(index, 1);
    markers[index].setMap(null);
    markers.splice(index, 1);
    
    // Update remaining markers' labels
    markers.forEach((marker, i) => {
        marker.setLabel((i + 1).toString());
    });
    
    updateLocationsList();
}

function updateLocationsList() {
    const list = document.getElementById('locations-list');
    list.innerHTML = '';
    
    locations.forEach((location, index) => {
        const item = document.createElement('div');
        item.className = 'location-item';
        item.innerHTML = `
            <span>${index + 1}. ${location.name}</span>
            <button onclick="removeLocation(${index})">Remove</button>
        `;
        list.appendChild(item);
    });
}

function optimizeRoute() {
    if (locations.length < 2) {
        alert('Please add at least 1 destination to optimize the route.');
        return;
    }

    // Show loading state
    const optimizeButton = document.querySelector('button[onclick="optimizeRoute()"]');
    optimizeButton.textContent = 'Optimizing...';
    optimizeButton.disabled = true;

    console.log('Sending locations for optimization:', locations.map(loc => loc.name));

    fetch('/optimize_route', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            locations: locations.map(loc => loc.name)
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Received optimization response:', data);
        if (data.error) {
            throw new Error(data.error);
        }
        displayOptimizedRoute(data.routes);
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error optimizing route: ' + error.message);
        
        // Clear the loading state
        document.getElementById('optimized-route').classList.add('hidden');
    })
    .finally(() => {
        optimizeButton.textContent = 'Optimize Route';
        optimizeButton.disabled = false;
    });
}

function displayOptimizedRoute(routes) {
    console.log('Displaying optimized routes:', routes);
    const routeDetails = document.getElementById('route-details');
    routeDetails.innerHTML = '';
    
    if (!routes || !Array.isArray(routes) || routes.length === 0) {
        console.error('Invalid routes data:', routes);
        alert('No valid routes found');
        return;
    }

    routes.forEach((route, routeIndex) => {
        console.log(`Processing route option ${routeIndex + 1}:`, route);
        
        const routeContainer = document.createElement('div');
        routeContainer.className = 'route-container mb-8';
        
        // Add route header
        const header = document.createElement('div');
        header.className = 'route-header mb-4';
        header.innerHTML = `
            <h3 class="text-xl font-semibold text-gray-800">
                Option ${routeIndex + 1}: Start at ${route.start_time}
                <span class="ml-2 text-gray-600">(Total: ${route.total_duration})</span>
            </h3>
        `;
        routeContainer.appendChild(header);

        // Add route steps with travel times
        if (route.route && Array.isArray(route.route)) {
            route.route.forEach((location, index) => {
                console.log(`Processing location ${index}:`, location);
                
                const item = document.createElement('div');
                item.className = 'route-item';
                
                // For all locations except the last one, show travel time to next location
                if (index < route.route.length - 1 && route.leg_details && route.leg_details[index]) {
                    const legDetail = route.leg_details[index];
                    console.log(`Leg detail for step ${index}:`, legDetail);
                    
                    if (legDetail && legDetail.details) {
                        const trafficClass = legDetail.details.traffic === 'Heavy' ? 'text-red-600' : 'text-green-600';
                        
                        item.innerHTML = `
                            <span class="number">${index + 1}</span>
                            <div class="flex-1">
                                <div>${location}</div>
                                <div class="text-sm mt-1">
                                    <span class="text-gray-600">→ Next stop: ${legDetail.details.duration}</span>
                                    <span class="${trafficClass}">(${legDetail.details.traffic} traffic)</span>
                                    ${legDetail.details.normal_duration !== legDetail.details.duration ? 
                                        `<span class="text-gray-500 ml-2">(normally ${legDetail.details.normal_duration})</span>` : 
                                        ''}
                                </div>
                            </div>
                        `;
                    } else {
                        console.warn(`Missing details for leg ${index}`);
                        item.innerHTML = `
                            <span class="number">${index + 1}</span>
                            <div class="flex-1">
                                <div>${location}</div>
                                <div class="text-sm mt-1 text-gray-600">Route information unavailable</div>
                            </div>
                        `;
                    }
                } else {
                    // Last location or missing leg details
                    item.innerHTML = `
                        <span class="number">${index + 1}</span>
                        <div class="flex-1">
                            <div>${location}</div>
                            ${index === route.route.length - 1 ? 
                                '<div class="text-sm mt-1 text-gray-600">Final destination</div>' : 
                                '<div class="text-sm mt-1 text-gray-600">Route information unavailable</div>'}
                        </div>
                    `;
                }
                
                routeContainer.appendChild(item);
            });
        } else {
            console.error('Invalid route data:', route);
        }
        
        routeDetails.appendChild(routeContainer);
    });

    document.getElementById('optimized-route').classList.remove('hidden');
    
    // Update markers for the first route (primary option)
    if (routes && routes.length > 0 && routes[0].route) {
        updateMapMarkers(routes[0].route);
    } else {
        console.error('No valid route data for markers');
    }
}

function updateMapMarkers(routeLocations) {
    console.log('Updating map markers with locations:', routeLocations);
    console.log('Available locations:', locations);

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));
    markers = [];
    
    if (!routeLocations || !Array.isArray(routeLocations)) {
        console.error('Invalid route locations provided:', routeLocations);
        return;
    }

    // Create a map of location names to their coordinates
    const locationMap = new Map(
        locations.map(loc => [loc.name, loc])
    );
    
    // Add new markers in optimized order
    routeLocations.forEach((locationName, index) => {
        console.log(`Processing location ${index}:`, locationName);
        const loc = locationMap.get(locationName);
        
        if (!loc) {
            console.warn(`Location not found: ${locationName}`);
            return;
        }

        const marker = new google.maps.Marker({
            position: { lat: loc.lat, lng: loc.lng },
            map: map,
            title: locationName,
            label: (index + 1).toString()
        });
        markers.push(marker);
    });
    
    if (markers.length > 0) {
        // Fit bounds to show all markers
        const bounds = new google.maps.LatLngBounds();
        markers.forEach(marker => bounds.extend(marker.getPosition()));
        map.fitBounds(bounds);
    } else {
        console.warn('No valid markers to display');
    }
} 