from flask import Flask, render_template, request, jsonify
from datetime import datetime, timedelta
import googlemaps
import os
from dotenv import load_dotenv
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
gmaps = googlemaps.Client(key=os.getenv('GOOGLE_MAPS_API_KEY'))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/optimize_route', methods=['POST'])
def optimize_route():
    try:
        locations = request.json['locations']
        logger.info(f"Received locations: {locations}")
        
        if not locations:
            return jsonify({"error": "No locations provided"}), 400
        
        # Get traffic info for different times of the day
        tomorrow = datetime.now() + timedelta(days=1)
        time_slots = [
            tomorrow.replace(hour=h, minute=0, second=0)
            for h in [9, 12, 15, 17, 19]  # Different times to check traffic
        ]
        logger.info(f"Checking traffic for times: {[t.strftime('%I:%M %p') for t in time_slots]}")
        
        # Get duration matrix for each time slot
        duration_matrices = []
        time_details = []
        
        for departure_time in time_slots:
            logger.info(f"Processing departure time: {departure_time.strftime('%I:%M %p')}")
            matrix = []
            time_matrix = []
            
            for i, origin in enumerate(locations):
                row = []
                time_row = []
                for j, destination in enumerate(locations):
                    if origin == destination:
                        row.append(0)
                        time_row.append({"duration": "0 min", "traffic": "No traffic"})
                        continue
                    
                    logger.debug(f"Requesting directions from {origin} to {destination} at {departure_time.strftime('%I:%M %p')}")
                    try:
                        result = gmaps.directions(
                            origin,
                            destination,
                            departure_time=departure_time,
                            traffic_model='best_guess'
                        )
                        
                        if not result:
                            logger.warning(f"No route found between {origin} and {destination}")
                            row.append(float('inf'))
                            time_row.append({"duration": "N/A", "traffic": "No route found"})
                            continue
                        
                        leg = result[0]['legs'][0]
                        duration = leg['duration_in_traffic']['value']
                        row.append(duration)
                        
                        normal_duration = leg['duration']['text']
                        traffic_duration = leg['duration_in_traffic']['text']
                        traffic_info = "Normal" if leg['duration']['value'] == leg['duration_in_traffic']['value'] else "Heavy"
                        
                        time_row.append({
                            "duration": traffic_duration,
                            "normal_duration": normal_duration,
                            "traffic": traffic_info
                        })
                        
                    except Exception as e:
                        logger.error(f"Error getting directions: {str(e)}")
                        row.append(float('inf'))
                        time_row.append({"duration": "Error", "traffic": f"Error: {str(e)}"})
                
                matrix.append(row)
                time_matrix.append(time_row)
            
            duration_matrices.append(matrix)
            time_details.append({
                "time": departure_time.strftime("%I:%M %p"),
                "matrix": time_matrix
            })
        
        # Find best routes for different starting times
        routes = []
        for start_hour in [9, 17]:  # Compare morning vs evening start
            logger.info(f"Calculating route for {start_hour}:00")
            total_duration = 0
            current_pos = 0
            unvisited = list(range(1, len(locations)))
            route = [0]  # Start with first location
            route_details = []
            
            # Get matrix index for this hour
            matrix_index = next((i for i, t in enumerate(time_slots) if t.hour == start_hour), 0)
            logger.info(f"Using matrix index {matrix_index} for hour {start_hour}")
            
            # Initialize first leg details
            if len(unvisited) > 0:
                first_leg = time_details[matrix_index]["matrix"][0][1]
                route_details.append({
                    "from": locations[0],
                    "to": locations[1],
                    "details": first_leg
                })
                total_duration += duration_matrices[matrix_index][0][1]
            
            while unvisited:
                best_next = min(
                    unvisited,
                    key=lambda x: duration_matrices[matrix_index][current_pos][x]
                )
                
                route.append(best_next)
                
                # Add leg details if there are more destinations
                if len(route) > 1:
                    prev_pos = current_pos
                    current_pos = best_next
                    
                    # Only add leg details if we haven't added this leg yet
                    if len(route_details) < len(route) - 1:
                        leg_time = time_details[matrix_index]["matrix"][prev_pos][current_pos]
                        total_duration += duration_matrices[matrix_index][prev_pos][current_pos]
                        route_details.append({
                            "from": locations[prev_pos],
                            "to": locations[current_pos],
                            "details": leg_time
                        })
                
                unvisited.remove(best_next)
            
            logger.info(f"Route details for {start_hour}:00: {route_details}")
            
            routes.append({
                "start_time": time_slots[matrix_index].strftime("%I:%M %p"),
                "total_duration": f"{int(total_duration / 60)} minutes",
                "route": [locations[i] for i in route],
                "leg_details": route_details
            })
        
        return jsonify({"routes": routes})
        
    except Exception as e:
        logger.error(f"Error in optimize_route: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 