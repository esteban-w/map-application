var Place = function(data){
    this.name = data.name;
    this.location = data.location;
    this.contact = data.contact;
    this.id = data.id;
    // This property will store a marker instance
    this.marker = null;
    // This property will store detailed information about the place
    this.details = data.details;
    // This method is used to control the output generated by JSON.stringify()
    this.toJSON = function (key) {
        var obj = {}, self = this;
        // Include only enumerable properties and exclude any that create circular references
        Object.keys(this).forEach(function (item) {
            if( item !== "toJSON" && item !== "marker" ) obj[item] = self[item];
        });
        return obj;
    };
};

var ViewModel = function (googleMap, placeList) {
    var self = this;

    // This property holds the reference to the instance of Google Map
    this.map = googleMap;

    // This property will hold all places
    this.placesMasterArray = [];

    // This observable will hold the places currently displayed
    this.placesToDisplay = ko.observableArray([]);

    // Transfer data coming from placeList to corresponding properties
    placeList.forEach( function(item, index){
        // Create corresponding instance and marker for each place
        var placeInstance = new Place(item);
        placeInstance.marker = new google.maps.Marker({
            map: self.map,
            title: item.name,
            position: { lat: item.location.lat, lng: item.location.lng },
            animation: google.maps.Animation.DROP,
            id: item.id
        });
        placeInstance.marker.addListener('click', function() {
            self.setPlace(placeInstance);
        });

        // Store data in corresponding properties
        self.placesMasterArray.push( placeInstance );
        self.placesToDisplay.push( placeInstance );

        // When last item is reached store all collected data in localStorage
        if( (index === (placeList.length - 1)) && !localStorage.getItem('venues-map') ){
            localStorage.setItem('venues-map', JSON.stringify(self.placesMasterArray));
        }
    });

    // This property will hold an instance of InfoWindow for the map
    this.infoWindow = new google.maps.InfoWindow({ maxWidth: 360 });

    // This method populates map's infowindow with corresponding place details
    this.populateInfowindow = function (place) {
        var address = place.details.location.formattedAddress ? (
                place.details.location.formattedAddress.join(", ") ):( place.details.location.address ),
            venueImage = place.details.bestPhoto ? (
                '<img class="float-left w-50 mr-2 mb-1" src="'+
                place.details.bestPhoto.prefix +'500x300'+ place.details.bestPhoto.suffix +
                '" title="'+ place.name +'">' ) : '';

        self.infoWindow.setContent(
            '<h5>'+ place.details.name +'</h5>' +
            '<div class="clearfix">' +
                venueImage +
                '<h6 class="mb-1">Description</h6>' +
                '<p class="mb-2">' + (place.details.description || 'N/A') + '</p>' +
            '</div>' +
            '<p>' +
                '(venue verified by owner: ' +
                (place.details.verified ? '<strong class="text-success">YES</strong>':'<strong class="text-danger">NO</strong>') +
                ')' +
            '</p>' +
            '<p class="mb-2"><strong>Address:</strong> ' + address + '</p>' +
            '<p class="mb-2"><strong>Phone:</strong> ' + (place.details.contact.formattedPhone || 'N/A') + '</p>' +
            '<p><strong>Rating:</strong> ' +
                '<span class="badge badge-pill" style="background-color: #'+ (place.details.ratingColor||'fff') +'">' + (place.details.rating || 'N/A') + '</span> ' +
                (place.details.ratingSignals ? '(number of ratings: '+ place.details.ratingSignals +')' : '') +
            '</p>' +
            '<div class="text-center"><small>Powered by <a href="https://developer.foursquare.com/" target="_blank">Foursquare</a></small></div>'
        );
    };

    // This method performs actions to open infowindow
    this.openInfowindow = function (place) {
        // Set infowindow's marker to current marker
        self.infoWindow.marker = place.marker;
        // If place details have already been retrieved just populate infowindow otherwise make GET request
        if( place.details ){
            self.populateInfowindow(place);
        } else {
            self.infoWindow.setContent('<p class="h6">Loading...</p>');
            // AJAX request to get place details
            var httpRequest = new XMLHttpRequest();
            httpRequest.onreadystatechange = function () {
                if (httpRequest.readyState === XMLHttpRequest.DONE) {
                    if (httpRequest.status === 200) {
                        var result = JSON.parse(httpRequest.responseText),
                            venue = result.response.venue || {};

                        if ( JSON.stringify(venue) === "{}" ) {
                            self.infoWindow.setContent("<h6>We're sorry but no places data is available</h6>");
                        } else {
                            // Store response
                            place.details = venue;
                            // Update localStorage
                            localStorage.setItem('venues-map', JSON.stringify(self.placesMasterArray));
                            // Populate infowindow
                            self.populateInfowindow(place);
                            self.infoWindow.open(self.map, place.marker);
                        }
                    } else {
                        self.infoWindow.setContent("<h6>We're sorry but the request to get details failed</h6>");
                    }
                }
            };
            // Remember to provide your own client_id and client_secret from Foursquare
            httpRequest.open(
                "GET",
                "https://api.foursquare.com/v2/venues/"+ place.id +"/?client_id=FOURSQUARE_CLIENT_ID_GOES_HERE&client_secret=FOURSQUARE_CLIENT_SECRET_GOES_HERE&v=20180101"
            );
            httpRequest.send();
        }
        // Display infowindow
        self.infoWindow.open(self.map, place.marker);
    };

    // This observable will hold the currently selected place
    this.activePlace = ko.observable( {} );

    // This method will perform place selection
    this.setPlace = function (model) {
        self.activePlace(model);
        // Loop through currently displayed places
        self.placesToDisplay().forEach(function (item, index) {
            if( item.id === model.id ){
                // Animate corresponding marker
                item.marker.setAnimation(google.maps.Animation.BOUNCE);
                // Display infowindow
                self.openInfowindow(item);
            } else {
                // Stop any other marker animation currently running
                item.marker.setAnimation(null);
            }
        });
    };

    // This method will perform filtering using values provided
    this.filterUpdate = function (model, event) {
        var filteredList = [];
        // Loop through all available places to pick only those that match the search
        self.placesMasterArray.forEach(function (place) {
            if( place.name.search( new RegExp(event.target.value, 'i') ) > -1 ){
                filteredList.push( place );
                // If marker is hidden display it using setMap()
                if( !place.marker.map ) place.marker.setMap( self.map );
            } else {
                place.marker.setMap(null);
            }
        });

        // Emit filtered place list
        self.placesToDisplay( filteredList );

        // To allow HTML element's default behaviour return true
        return true;
    };

    // This observable will hold the value to show or hide main navigation
    this.showNav = ko.observable(false);

    // This method toggles main navigation
    this.toggleNav = function (model, event) {
        self.showNav( !self.showNav() );
        // Find nav toggler button to update 'aria-expanded' attribute accordingly
        var nav_button = event.path.find(function (item) {
            return item.className.search(/navbar-toggler(?![\w-])/) > -1;
        });
        if(nav_button) nav_button.setAttribute('aria-expanded', self.showNav() );
    };
    
};


// Google Map's initialization
var map;

function initMap() {
    var new_york = {lat: 40.7413549, lng: -73.9980244};
    // Constructor creates a new map - only center and zoom are required.
    map = new google.maps.Map(document.getElementById('map'), {
        center: new_york,
        zoom: 13
    });

    // Look for previously stored data, otherwise make GET request to retrieve data
    var venues_data = localStorage.getItem('venues-map');
    if( venues_data ){
        ko.applyBindings( new ViewModel(map, JSON.parse(venues_data)) );
    } else {
        // AJAX request to get places data
        var httpRequest = new XMLHttpRequest();
        httpRequest.onreadystatechange = function () {
            if (httpRequest.readyState === XMLHttpRequest.DONE) {
                if (httpRequest.status === 200) {
                    var results = JSON.parse(httpRequest.responseText),
                        venues = results.response.venues ? results.response.venues : [];

                    if (!venues.length) {
                        alert("We're sorry but no places data is available.");
                    }
                    // Initialize Knockout bindings
                    ko.applyBindings(new ViewModel(map, venues));
                } else {
                    alert("We're sorry but the request to get places data failed.");
                }
            }
        };
        // Remember to provide your own client_id and client_secret from Foursquare
        httpRequest.open(
            "GET",
            "https://api.foursquare.com/v2/venues/search?query=rehearsal+studios&radius=2000&ll="+new_york.lat+","+new_york.lng+"&limit=10&client_id=FOURSQUARE_CLIENT_ID_GOES_HERE&client_secret=FOURSQUARE_CLIENT_SECRET_GOES_HERE&v=20180101"
        );
        httpRequest.send();
    }

}//-- end initMap()

function mapError(){
    alert("We're sorry but Google Maps failed to load, please refresh to try again.");
}
