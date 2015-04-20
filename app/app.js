var faceApp = angular.module('faceApp', ['ngRoute', 'angular-storage']);


/* ----------------------------------------
 * ROUTES and CONFIG
 * ----------------------------------------
 */

faceApp.config(

	function($routeProvider){

	$routeProvider
	.when('/:id/edit', {
		controller: 'ViewCtrl',
		templateUrl: 'views/view.html',
		resolve: {
			routeData: appCtrl.routeData
		}
	})
	.when('/', {
		controller: 'ViewCtrl',
		templateUrl: 'views/view.html',
		resolve: {
			routeData: appCtrl.routeData
		}
	})
	.otherwise({ redirectTo: '/' });
});


/* ----------------------------------------
 * CONTROLLERS
 * ----------------------------------------
 */

// https://thinkster.io/egghead/resolve-routechangeerror
// egghead's suggestion to have one global controller to handle high-level app functionality
var appCtrl = faceApp.controller('AppCtrl', function($rootScope, $location){
	// Listing these events here for reference
	$rootScope.$on("$routeChangeStart", function(event, current, previous){});
	$rootScope.$on("locationChangeStart", function(){});
	$rootScope.$on("$routeChangeSuccess", function(event, current, previous){});
	$rootScope.$on("$locationChangeSuccess", function(event, current, previous){});

	$rootScope.$on("$routeChangeError", function(event, current, previous, rejection){
		// Requested face is not found
		if (rejection.path === '/new') {
			// We're on /new already and there was an error. Simply return the rejection
			// TODO - will this cause a circular route resolve?
			return rejection;
		} else {
			$location.path('/');
		}
	});

});

// localstorage: https://github.com/auth0/angular-storage

// Called from $routeProvider resolve function.
// Responsible for fetching the requested face or serving the generic face in absence of a valid one
appCtrl.routeData = function($q, $location, $route, FaceStorageService, store) {

	var deferred = $q.defer();
	var requestedId = $route.current.params.id;
	var found = requestedId ? FaceStorageService.find( requestedId ) : FaceStorageService.getGeneric(); // store either a valid requested face or the generic face

	if ( found ) { 
		deferred.resolve({ 
			found: found,
			message: 'requested id ' + requestedId + 'has been found',
			requestedId: requestedId,
			path: $location.path()
		});
	} else {
		deferred.reject({
			found: false,
			message: 'requested id ' + requestedId + ' not found',
			requestedId: requestedId,
			path: $location.path()
		});
	}
	
	return deferred.promise;
};

// Controller that handles view-related logic
var viewCtrl = faceApp.controller('ViewCtrl', function($scope, $routeParams, $location, routeData, StateService, FaceBuilderService, FaceStorageService, FeatureService){

	/* ---------- Scope methods ---------- */
	$scope.createFace = function(newFace, label){
		if (!label || label === ''){
			label = 'untitled';
		}

		// We have all the information we need. Proceed with creating a new face
		newFace.label = label;
		newFace = FaceStorageService.create( newFace );

		// redirect to the newly-created face's edit state
		$location.path('/' + newFace.id + '/edit'); 
	};

	$scope.deleteFace = function(id){
		FaceStorageService.delete( id );
		$location.path('/'); 
	};

	$scope.updateFeature = function(item, featureSet, newValue){

		// if we're dealing with a feature update, apply the edit to the face
		if (item === 'feature') { 
			// update the scope's state and helper message
			$scope.messages.helperText = "You have unsaved changes";
			$scope.face.features[featureSet] = newValue; 
			$scope.state.isEdited = true;
		} else if (item === 'label') {	
			$scope.state.isEditingLabel = true;
		}
	};

	$scope.saveChanges = function(){
		// apply the temp label to the face
		$scope.face.label = $scope.tempFace.label || 'untitled';

		// Update the facestorageService and reset all states/messages
		FaceStorageService.update( $scope.face.id, $scope.face );
		$scope.resetState();
	};

	$scope.cancelChanges = function(item) {
		if (item === 'label') {
			$scope.tempFace.label = $scope.face.label;
			$scope.state.isEditingLabel = false;
			$scope.state.showLabel = false;

		} else {
			$scope.face = angular.copy( routeData.found );
			$scope.resetState();
		}
	};

	$scope.resetState = function(item){

		// reset states
		$scope.state.isEdited = false;
		$scope.state.isAlert = false;
		$scope.state.isEditingLabel = false;
		$scope.state.showLabel = false;
		$scope.state.isNewFace = routeData.path === '/';

		// reset temp face and helper text
		$scope.messages.helperText = $scope.state.isNewFace ? '' : 'No unsaved changes...';
		$scope.tempFace.label = $scope.face.label;
	};

	/* ---------- Setup ---------- */

	// Set current face based on route resolve
	$scope.face = angular.copy( routeData.found ); // this object is provided by the $route's resolve function
	$scope.tempFace = angular.copy( $scope.face );

	// Place features and faces on scope
	$scope.features = FeatureService.list();
	$scope.savedFaces = FaceStorageService.list();
	// $scope.builder = FaceBuilderService;
	// $scope.state = StateService;

	// Set app-wide messages and initial state obj
	$scope.state = {};
	$scope.messages = {};
	$scope.messages.saveText = $scope.state.isNewFace ? 'Save your new face' : 'Save changes';
	$scope.messages.cancelText = $scope.state.isNewFace ? 'Reset' : 'Discard changes';

	$scope.resetState();

});

faceApp.factory('UtilService', function(){
	return {
		extendDeep: function extendDeep (destination) {
			angular.forEach(arguments, function(item) {
				if (item !== destination) {
					angular.forEach(item, function(value, key) {
						if (destination[key] && destination[key].constructor && destination[key].constructor === Object) {
							extendDeep(destination[key], value);
						} else {
							destination[key] = value;
						}     
					});   
				}
			});

			return destination;
		},

		generateUniqueId:  function generateId(arr){
			// Generates a unique id from within the existing IDs in the provided array
			return getMaxId(arr) + 1;
		},

		getMaxId: function getMaxId(arr){
			return _.max(arr, function(item){return item.id;}).id;
		},

		getIndex: function getIndex( arr, id ){
			// Returns the index of an existing item in the provided array
			var foundIndex;
			_.find(arr, function(item, index){
				if (item.id === id) {
					foundIndex = index;
				}
			});

			return foundIndex;
		}
	};
});


faceApp.factory('StateService', function(  ){
	var messages = {
		save: {
			'new': 'Save your new face',
			'existing': 'Save changes'
		},
		cancel: {
			'new': 'Reset',
			'existing': 'Discard changes'
		},
		helper: {
			'new': '',
			'existing': 'No unsaved changes'
		}
	};

	function setText(type, isNew){
		var state = isNew ? 'new' : 'existing';
		return messages[type][state] || '';
	}

	return {
		// state booleans
		state: {
			isNewFace: true,
			isEdited: false,
			isAlert: false,
			isEditingLabel: false,
			showLabel: false,
			saveText: setText('save', this.isNewFace),
			cancelText: setText('cancel', this.isNewFace),
			helperText: setText('helper', this.isNewFace)
		},

		// reset method
		reset: function( routePath ){
			state.isEdited = false;
			state.isAlert = false;
			state.isEditingLabel = false;
			state.showLabel = false;
			state.isNewFace = routePath === '/';
			state.helperText = setText('helper', state.isNewFace);

			// reset temp face and helper text
			// messages.helperText = state.isNewFace ? '' : 'No unsaved changes...';
			// $scope.tempFace.label = $scope.face.label;

		}
	};
});

faceApp.factory('FaceBuilderService', function( StateService ){
	return {
		
	};
});

faceApp.factory('FaceStorageService', function( FeatureService, UtilService, store ){
	
	// get the localstorage namespace
	var faces = store.getNamespacedStore('faces');

	// if present, get previously-saved highestIndex
	var highestIndex = store.get('highestIndex') || -1; 

	// populate the in-memory cache
	var cache = init();
	
	function init() {
		var _counter = 0;
		var _initCache = {};
		var _face;

		// pluck all values from localStorage and store them in the local cache
		do {
			face = faces.get(_counter);
			if (face) {
				_initCache[_counter] = face;

				// we found a saved face. increment or set highestIndex to 0
				highestIndex = highestIndex ? highestIndex++ : 0; 
			}
			_counter++;
		} while ( _counter <= highestIndex );

		// reset highestIndex in localstorage to reflect updated value
		store.set('highestIndex', UtilService.getMaxId(_initCache)); 
		
		return _initCache;
	}

	return {
		getGeneric: function(){
			return {
				features: {eyes: '-', nose: '.', 	mouth: 'v' }
			};
		},
		list: function(){
			return cache;
		},
		find: function( id ){
			return _.find(cache, function(face){return face.id == id;});
		},
		create: function( newObj ){
			// generate a new id based on previous max id
			newObj.id = UtilService.getMaxId(cache) + 1 || 0; 

			// copy the new obj into the in-memory cache
			cache[newObj.id] = angular.copy(newObj);

			// stow it in localstorage
			faces.set(newObj.id, newObj);

			// adjust the highestIndex in localstorage in case the current id is the highest
			if (newObj.id > highestIndex) { 
				highestIndex = newObj.id;
				store.set('highestIndex', newObj.id);
			} 

			return newObj;
		},
		update: function(id, newObj){
			var existing = cache[id];
			var updated;

			if (existing) {
				faces.set(id, cache[id] = newObj);
			} else {
				return false;
			}
		},
		recache: function(){
			return cache = store.get('faces');
		},
		'delete': function( id ){
			var _face;

			faces.remove(id);
			delete cache[id];

			// reset highestIndex if currently deleted face represents the highest
			if (id === highestIndex){
				while (!faces.get(highestIndex) && highestIndex > -1) {
					highestIndex--;
				}
				store.set('highestIndex', highestIndex);
			}
		} 
	};
});

faceApp.factory('FeatureService', function(){
	var _features = {
		eyes: ['-', '.', '*', 'v', 'o', 'O*', '|.', 'U', '+', '=', '0', 'd', '@', 'x', ''],
		nose: ['l', '~', '/', '.', 'o', 'L', 'T', '^', ')', ''],
		mouth: ['U','.', 'o', '>-<', 'W', '*', '|.|', '_', '-', 'v', '|v|', 'Q', '~~', '/o/', ''],
		hair: ['ll', 'xxxxx', ')_)_)-_',  'llllll', '(', 'H', '/', '@', '======', 'O|O|O|}', '.~~.', ')_())_', 'MM', ':,,:,', '' ],
	};

	return {
		list: function(){
			return _features;
		},
		listOneSet: function(featureSet){
			return _features[featureSet];
		}
	};
});


/* ----------------------------------------
 * DIRECTIVES
 * ----------------------------------------
 */
faceApp.directive('faceCanvas', function(){
	return {
		scope: {
			face: '='
		},
		templateUrl: 'directives/face.html'
	};
});

faceApp.directive('featureChooser', function(){
	return {
		transclude: true,
		scope: {
			feature: '@',
			choices: '=',
			selected: '=',
			onSelect: '&onSelect'
		},
		templateUrl: 'directives/feature-chooser.html',
		controller: function($scope){
			// on load, highlight the current choice in the chooser
			$scope.activeChoice = $scope.selected;

			// run this fn when clicking on a choice. Sets current choice to active and applies its results to parent scope
			$scope.select = function(active){
				$scope.activeChoice = active;

				// calling the external fn passed in through the scope's '&'
				// we're using a format here that allows us to pass in arguments to the parent scope's function
				$scope.onSelect()('feature', $scope.feature, active);
			};

			// Determines if a choice is currently active. When true, applies the active class
			$scope.isActive = function(item) {
				return $scope.activeChoice === item;
			};
		}
	};
});

faceApp.directive('savedFaces', function(){
	return {
		scope: {
			faces: '=',
			active: '=',
			onDelete: '&onDelete'
		 },
		templateUrl: 'directives/face-index.html',
		controller: function($scope){
			
			$scope.deleteThis = function(id){
				$scope.onDelete()(id); // call the directive instance's onDelete function and pass in clicked face's id
			};

		}
	};
});

// http://stackoverflow.com/questions/17470790/how-to-use-a-keypress-event-in-angularjs
faceApp.directive('ngEnter', function () {
    return function (scope, element, attrs) {
        element.bind("keydown keypress", function (event) {
            if(event.which === 13) {
                scope.$apply(function (){
                    scope.$eval(attrs.ngEnter);
                });

                event.preventDefault();
            }
        });
    };
});

// Todo - build modal directive
// Possible - http://adamalbrecht.com/2013/12/12/creating-a-simple-modal-dialog-directive-in-angular-js/
faceApp.directive('modal', function () {
    return function () {};
});

/* ----------------------------------------
 * FILTERS
 * ----------------------------------------
 */
// http://stackoverflow.com/questions/17839141/angularjs-checking-if-a-js-object-is-empty-works-with-ng-show-but-not-from-cont
faceApp.filter('isEmpty', function () {
	return function (obj) {
		for (var bar in obj) {
			if (obj.hasOwnProperty(bar)) {
				return false;
			}
		}
		return true;
	};
});