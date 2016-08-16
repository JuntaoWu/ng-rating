(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
function createMap() {
    return Object.create(null);
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createMap;

},{}],2:[function(require,module,exports){
"use strict";
var uid = 0;
function nextUid() {
    return ++uid;
}
function hashKey(obj, nextUidFn) {
    var key = obj && obj.$$hashKey;
    if (key) {
        if (typeof key === 'function') {
            key = obj.$$hashKey();
        }
        return key;
    }
    var objType = typeof obj;
    if (objType == 'function' || (objType == 'object' && obj !== null)) {
        key = obj.$$hashKey = objType + ':' + (nextUidFn || nextUid)();
    }
    else {
        key = objType + ':' + obj;
    }
    return key;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = hashKey;

},{}],3:[function(require,module,exports){
/// <reference path="../typings/index.d.ts" />
"use strict";
var minErr_1 = require("./minErr");
var hashKey_1 = require("./hashKey");
var createMap_1 = require("./createMap");
var utils_1 = require("./utils");
var isArrayLike = utils_1.default.isArrayLike;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var isArray = utils_1.default.isArray;
var isFunction = utils_1.default.isFuntion;
var isBlankObject = utils_1.default.isBlankObject;
var slice = [].slice;
var forEach = utils_1.default.forEach;
var getBlockNodes = utils_1.default.getBlockNodes;
angular.module('ng-repeat-n-directive', [])
    .directive('ngRepeatN', ['$parse', '$animate', '$compile', function ($parse, $animate, $compile) {
        var NG_REMOVED = '$$NG_REMOVED';
        var ngRepeatMinErr = minErr_1.default('ngRepeat');
        var updateScope = function (scope, index, valueIdentifier, value, keyIdentifier, key, arrayLength) {
            // TODO(perf): generate setters to shave off ~40ms or 1-1.5%
            scope[valueIdentifier] = value;
            if (keyIdentifier)
                scope[keyIdentifier] = key;
            scope.$index = index;
            scope.$first = (index === 0);
            scope.$last = (index === (arrayLength - 1));
            scope.$middle = !(scope.$first || scope.$last);
            // jshint bitwise: false
            scope.$odd = !(scope.$even = (index & 1) === 0);
            // jshint bitwise: true
        };
        var getBlockStart = function (block) {
            return block.clone[0];
        };
        var getBlockEnd = function (block) {
            return block.clone[block.clone.length - 1];
        };
        return {
            restrict: 'A',
            multiElement: true,
            transclude: 'element',
            priority: 1000,
            terminal: true,
            $$tlb: true,
            compile: function ngRepeatCompile($element, $attr) {
                var ngRepeatN = parseInt($attr.ngRepeatN);
                var array = new Array(ngRepeatN);
                for (var i = 0; i < array.length; ++i) {
                    array[i] = i;
                }
                var expression = 'item in [' + array.toString() + ']';
                var ngRepeatEndComment = $compile.$$createComment('end ngRepeat', expression);
                var match = expression.match(/^\s*([\s\S]+?)\s+in\s+([\s\S]+?)(?:\s+as\s+([\s\S]+?))?(?:\s+track\s+by\s+([\s\S]+?))?\s*$/);
                if (!match) {
                    throw ngRepeatMinErr('iexp', "Expected expression in form of '_item_ in _collection_[ track by _id_]' but got '{0}'.", expression);
                }
                var lhs = match[1];
                var rhs = match[2];
                var aliasAs = match[3];
                var trackByExp = match[4];
                match = lhs.match(/^(?:(\s*[\$\w]+)|\(\s*([\$\w]+)\s*,\s*([\$\w]+)\s*\))$/);
                if (!match) {
                    throw ngRepeatMinErr('iidexp', "'_item_' in '_item_ in _collection_' should be an identifier or '(_key_, _value_)' expression, but got '{0}'.", lhs);
                }
                var valueIdentifier = match[3] || match[1];
                var keyIdentifier = match[2];
                if (aliasAs && (!/^[$a-zA-Z_][$a-zA-Z0-9_]*$/.test(aliasAs) ||
                    /^(null|undefined|this|\$index|\$first|\$middle|\$last|\$even|\$odd|\$parent|\$root|\$id)$/.test(aliasAs))) {
                    throw ngRepeatMinErr('badident', "alias '{0}' is invalid --- must be a valid JS identifier which is not a reserved name.", aliasAs);
                }
                var trackByExpGetter, trackByIdExpFn, trackByIdArrayFn, trackByIdObjFn;
                var hashFnLocals = { $id: hashKey_1.default };
                if (trackByExp) {
                    trackByExpGetter = $parse(trackByExp);
                }
                else {
                    trackByIdArrayFn = function (key, value) {
                        return hashKey_1.default(value);
                    };
                    trackByIdObjFn = function (key) {
                        return key;
                    };
                }
                return function ngRepeatLink($scope, $element, $attr, ctrl, $transclude) {
                    if (trackByExpGetter) {
                        trackByIdExpFn = function (key, value, index) {
                            // assign key, value, and $index to the locals so that they can be used in hash functions
                            if (keyIdentifier)
                                hashFnLocals[keyIdentifier] = key;
                            hashFnLocals[valueIdentifier] = value;
                            hashFnLocals.$index = index;
                            return trackByExpGetter($scope, hashFnLocals);
                        };
                    }
                    // Store a list of elements from previous run. This is a hash where key is the item from the
                    // iterator, and the value is objects with following properties.
                    //   - scope: bound scope
                    //   - element: previous element.
                    //   - index: position
                    //
                    // We are using no-proto object so that we don't need to guard against inherited props via
                    // hasOwnProperty.
                    var lastBlockMap = createMap_1.default();
                    //watch props
                    $scope.$watchCollection(rhs, function ngRepeatAction(collection) {
                        var index, length, previousNode = $element[0], // node that cloned nodes should be inserted after
                        // initialized to the comment node anchor
                        nextNode, 
                        // Same as lastBlockMap but it has the current state. It will become the
                        // lastBlockMap on the next iteration.
                        nextBlockMap = createMap_1.default(), collectionLength, key, value, // key/value of iteration
                        trackById, trackByIdFn, collectionKeys, block, // last object information {scope, element, id}
                        nextBlockOrder, elementsToRemove;
                        if (aliasAs) {
                            $scope[aliasAs] = collection;
                        }
                        if (isArrayLike(collection)) {
                            collectionKeys = collection;
                            trackByIdFn = trackByIdExpFn || trackByIdArrayFn;
                        }
                        else {
                            trackByIdFn = trackByIdExpFn || trackByIdObjFn;
                            // if object, extract keys, in enumeration order, unsorted
                            collectionKeys = [];
                            for (var itemKey in collection) {
                                if (hasOwnProperty.call(collection, itemKey) && itemKey.charAt(0) !== '$') {
                                    collectionKeys.push(itemKey);
                                }
                            }
                        }
                        collectionLength = collectionKeys.length;
                        nextBlockOrder = new Array(collectionLength);
                        // locate existing items
                        for (index = 0; index < collectionLength; index++) {
                            key = (collection === collectionKeys) ? index : collectionKeys[index];
                            value = collection[key];
                            trackById = trackByIdFn(key, value, index);
                            if (lastBlockMap[trackById]) {
                                // found previously seen block
                                block = lastBlockMap[trackById];
                                delete lastBlockMap[trackById];
                                nextBlockMap[trackById] = block;
                                nextBlockOrder[index] = block;
                            }
                            else if (nextBlockMap[trackById]) {
                                // if collision detected. restore lastBlockMap and throw an error
                                forEach(nextBlockOrder, function (block) {
                                    if (block && block.scope)
                                        lastBlockMap[block.id] = block;
                                });
                                throw ngRepeatMinErr('dupes', "Duplicates in a repeater are not allowed. Use 'track by' expression to specify unique keys. Repeater: {0}, Duplicate key: {1}, Duplicate value: {2}", expression, trackById, value);
                            }
                            else {
                                // new never before seen block
                                nextBlockOrder[index] = { id: trackById, scope: undefined, clone: undefined };
                                nextBlockMap[trackById] = true;
                            }
                        }
                        // remove leftover items
                        for (var blockKey in lastBlockMap) {
                            block = lastBlockMap[blockKey];
                            elementsToRemove = getBlockNodes(block.clone);
                            $animate.leave(elementsToRemove);
                            if (elementsToRemove[0].parentNode) {
                                // if the element was not removed yet because of pending animation, mark it as deleted
                                // so that we can ignore it later
                                for (index = 0, length = elementsToRemove.length; index < length; index++) {
                                    elementsToRemove[index][NG_REMOVED] = true;
                                }
                            }
                            block.scope.$destroy();
                        }
                        // we are not using forEach for perf reasons (trying to avoid #call)
                        for (index = 0; index < collectionLength; index++) {
                            key = (collection === collectionKeys) ? index : collectionKeys[index];
                            value = collection[key];
                            block = nextBlockOrder[index];
                            if (block.scope) {
                                // if we have already seen this object, then we need to reuse the
                                // associated scope/element
                                nextNode = previousNode;
                                // skip nodes that are already pending removal via leave animation
                                do {
                                    nextNode = nextNode.nextSibling;
                                } while (nextNode && nextNode[NG_REMOVED]);
                                if (getBlockStart(block) != nextNode) {
                                    // existing item which got moved
                                    $animate.move(getBlockNodes(block.clone), null, previousNode);
                                }
                                previousNode = getBlockEnd(block);
                                updateScope(block.scope, index, valueIdentifier, value, keyIdentifier, key, collectionLength);
                            }
                            else {
                                // new item which we don't know about
                                $transclude(function ngRepeatTransclude(clone, scope) {
                                    block.scope = scope;
                                    // http://jsperf.com/clone-vs-createcomment
                                    var endNode = ngRepeatEndComment.cloneNode(false);
                                    clone[clone.length++] = endNode;
                                    $animate.enter(clone, null, previousNode);
                                    previousNode = endNode;
                                    // Note: We only need the first/last node of the cloned nodes.
                                    // However, we need to keep the reference to the jqlite wrapper as it might be changed later
                                    // by a directive with templateUrl when its template arrives.
                                    block.clone = clone;
                                    nextBlockMap[block.id] = block;
                                    updateScope(block.scope, index, valueIdentifier, value, keyIdentifier, key, collectionLength);
                                });
                            }
                        }
                        lastBlockMap = nextBlockMap;
                    });
                };
            }
        };
    }]);

},{"./createMap":1,"./hashKey":2,"./minErr":4,"./utils":5}],4:[function(require,module,exports){
"use strict";
var utils_1 = require("./utils");
var isArrayLike = utils_1.default.isArrayLike;
var isUndefined = utils_1.default.isUndefined;
var isWindow = utils_1.default.isWindow;
var isScope = utils_1.default.isScope;
var isObject = utils_1.default.isObject;
function toJsonReplacer(key, value) {
    var val = value;
    if (typeof key === 'string' && key.charAt(0) === '$' && key.charAt(1) === '$') {
        val = undefined;
    }
    else if (isWindow(value)) {
        val = '$WINDOW';
    }
    else if (value && window.document === value) {
        val = '$DOCUMENT';
    }
    else if (isScope(value)) {
        val = '$SCOPE';
    }
    return val;
}
/* global toDebugString: true */
function serializeObject(obj) {
    var seen = [];
    return JSON.stringify(obj, function (key, val) {
        val = toJsonReplacer(key, val);
        if (isObject(val)) {
            if (seen.indexOf(val) >= 0)
                return '...';
            seen.push(val);
        }
        return val;
    });
}
function toDebugString(obj) {
    if (typeof obj === 'function') {
        return obj.toString().replace(/ \{[\s\S]*$/, '');
    }
    else if (isUndefined(obj)) {
        return 'undefined';
    }
    else if (typeof obj !== 'string') {
        return serializeObject(obj);
    }
    return obj;
}
function default_1(module, ErrorConstructor) {
    ErrorConstructor = ErrorConstructor || Error;
    return function () {
        var SKIP_INDEXES = 2;
        var templateArgs = arguments, code = templateArgs[0], message = '[' + (module ? module + ':' : '') + code + '] ', template = templateArgs[1], paramPrefix, i;
        message += template.replace(/\{\d+\}/g, function (match) {
            var index = +match.slice(1, -1), shiftedIndex = index + SKIP_INDEXES;
            if (shiftedIndex < templateArgs.length) {
                return toDebugString(templateArgs[shiftedIndex]);
            }
            return match;
        });
        message += '\nhttp://errors.angularjs.org/1.5.8/' +
            (module ? module + '/' : '') + code;
        for (i = SKIP_INDEXES, paramPrefix = '?'; i < templateArgs.length; i++, paramPrefix = '&') {
            message += paramPrefix + 'p' + (i - SKIP_INDEXES) + '=' +
                encodeURIComponent(toDebugString(templateArgs[i]));
        }
        return new ErrorConstructor(message);
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;

},{"./utils":5}],5:[function(require,module,exports){
/// <reference path="../typings/index.d.ts" />
"use strict";
function isArrayLike(obj) {
    // `null`, `undefined` and `window` are not array-like
    if (obj == null || isWindow(obj))
        return false;
    // arrays, strings and jQuery/jqLite objects are array like
    // * jqLite is either the jQuery or jqLite constructor function
    // * we have to check the existence of jqLite first as this method is called
    //   via the forEach method when constructing the jqLite object in the first place
    if (isArray(obj) || isString(obj))
        return true;
    // Support: iOS 8.2 (not reproducible in simulator)
    // "length" in obj used to prevent JIT error (gh-11508)
    var length = "length" in Object(obj) && obj.length;
    // NodeList objects (with `item` method) and
    // other objects with suitable length characteristics are array-like
    return isNumber(length) &&
        (length >= 0 && ((length - 1) in obj || obj instanceof Array) || typeof obj.item == 'function');
}
function isUndefined(value) { return typeof value === 'undefined'; }
function isWindow(obj) {
    return obj && obj.window === obj;
}
function isScope(obj) {
    return obj && obj.$evalAsync && obj.$watch;
}
var isArray = Array.isArray;
function isString(value) { return typeof value === 'string'; }
function isNumber(value) { return typeof value === 'number'; }
function isObject(value) { return value !== null && typeof value === 'object'; }
function isFunction(value) { return typeof value === 'function'; }
function isBlankObject(value) {
    return value !== null && typeof value === 'object' && !getPrototypeOf(value);
}
var getPrototypeOf = Object.getPrototypeOf;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var slice = [].slice;
function forEach(obj, iterator, context) {
    var key, length;
    if (obj) {
        if (isFunction(obj)) {
            for (key in obj) {
                // Need to check if hasOwnProperty exists,
                // as on IE8 the result of querySelectorAll is an object without a hasOwnProperty function
                if (key != 'prototype' && key != 'length' && key != 'name' && (!obj.hasOwnProperty || obj.hasOwnProperty(key))) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
        else if (isArray(obj) || isArrayLike(obj)) {
            var isPrimitive = typeof obj !== 'object';
            for (key = 0, length = obj.length; key < length; key++) {
                if (isPrimitive || key in obj) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
        else if (obj.forEach && obj.forEach !== forEach) {
            obj.forEach(iterator, context, obj);
        }
        else if (isBlankObject(obj)) {
            // createMap() fast path --- Safe to avoid hasOwnProperty check because prototype chain is empty
            for (key in obj) {
                iterator.call(context, obj[key], key, obj);
            }
        }
        else if (typeof obj.hasOwnProperty === 'function') {
            // Slow path for objects inheriting Object.prototype, hasOwnProperty check needed
            for (key in obj) {
                if (obj.hasOwnProperty(key)) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
        else {
            // Slow path for objects which do not have a method `hasOwnProperty`
            for (key in obj) {
                if (hasOwnProperty.call(obj, key)) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
    }
    return obj;
}
function getBlockNodes(nodes) {
    // TODO(perf): update `nodes` instead of creating a new object?
    var node = nodes[0];
    var endNode = nodes[nodes.length - 1];
    var blockNodes;
    for (var i = 1; node !== endNode && (node = node.nextSibling); i++) {
        if (blockNodes || nodes[i] !== node) {
            if (!blockNodes) {
                blockNodes = jqLite(slice.call(nodes, 0, i));
            }
            blockNodes.push(node);
        }
    }
    return blockNodes || nodes;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    isArrayLike: isArrayLike,
    isUndefined: isUndefined,
    isWindow: isWindow,
    isScope: isScope,
    isArray: isArray,
    isString: isString,
    isObject: isObject,
    isFuntion: isFunction,
    isBlankObject: isBlankObject,
    forEach: forEach,
    getBlockNodes: getBlockNodes
};

},{}],6:[function(require,module,exports){
/// <reference path="../typings/index.d.ts" />
"use strict";
require("ng-repeat-n");
angular.module("ng-rating-directive", ["ng-repeat-n-directive"])
    .directive('ngRating', ['$parse', '$animate', '$compile', function ($parse, $animate, $compile) {
        return {
            restrict: 'E',
            template: "<div class=\"ng-rating-container\">\n                           <span class=\"ng-rating-item\" ng-repeat-n=\"5\" ng-click=\"changeRating($index)\">\n                               <i class=\"full fa fa-star\" ng-show=\"($index + 1) <= bindRating\"></i>\n                               <i class=\"half fa fa-star-half\" ng-show=\"($index + 0.5) == bindRating\"></i>\n                               <i class=\"empty fa fa-star-o\" ng-show=\"$index >= bindRating\"></i>\n                           </span>\n                       </div>",
            link: function ($scope, $element, $attributes, controller) {
                var getter = $parse($attributes.ngModel);
                var setter = getter.assign;
                $scope.$watch($attributes.ngModel, function () {
                    $scope.bindRating = getter($scope) || 0;
                });
                $scope.changeRating = function ($index) {
                    if (($index + 1) != $scope.bindRating) {
                        $scope.bindRating = $index + 1;
                    }
                    else {
                        $scope.bindRating = $index + 0.5;
                    }
                    setter($scope, $scope.bindRating);
                };
            }
        };
    }]);
},{"ng-repeat-n":3}],7:[function(require,module,exports){

},{}]},{},[6,7])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbmctcmVwZWF0LW4vbGliL2NyZWF0ZU1hcC5qcyIsIm5vZGVfbW9kdWxlcy9uZy1yZXBlYXQtbi9saWIvaGFzaEtleS5qcyIsIm5vZGVfbW9kdWxlcy9uZy1yZXBlYXQtbi9saWIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbmctcmVwZWF0LW4vbGliL21pbkVyci5qcyIsIm5vZGVfbW9kdWxlcy9uZy1yZXBlYXQtbi9saWIvdXRpbHMuanMiLCJzcmMvaW5kZXgudHMiLCJ0eXBpbmdzL2Jyb3dzZXIuZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25IQSw4Q0FBOEM7O0FBRTlDLFFBQU8sYUFBYSxDQUFDLENBQUE7QUFFckIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLHVCQUF1QixDQUFDLENBQUM7S0FDM0QsU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRO1FBQzFGLE1BQU0sQ0FBQztZQUNILFFBQVEsRUFBRSxHQUFHO1lBQ2IsUUFBUSxFQUFFLHVoQkFNUTtZQUNsQixJQUFJLEVBQUUsVUFBVSxNQUFNLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxVQUFVO2dCQUNyRCxJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN6QyxJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUMzQixNQUFNLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUU7b0JBQy9CLE1BQU0sQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDNUMsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsTUFBTSxDQUFDLFlBQVksR0FBRyxVQUFVLE1BQU07b0JBQ2xDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO3dCQUNwQyxNQUFNLENBQUMsVUFBVSxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUM7b0JBQ25DLENBQUM7b0JBQ0QsSUFBSSxDQUFDLENBQUM7d0JBQ0YsTUFBTSxDQUFDLFVBQVUsR0FBRyxNQUFNLEdBQUcsR0FBRyxDQUFDO29CQUNyQyxDQUFDO29CQUNELE1BQU0sQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUN0QyxDQUFDLENBQUM7WUFDTixDQUFDO1NBQ0osQ0FBQztJQUNOLENBQUMsQ0FBQyxDQUFDLENBQUM7O0FDakNSIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xyXG5mdW5jdGlvbiBjcmVhdGVNYXAoKSB7XHJcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZShudWxsKTtcclxufVxyXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XHJcbmV4cG9ydHMuZGVmYXVsdCA9IGNyZWF0ZU1hcDtcclxuIiwiXCJ1c2Ugc3RyaWN0XCI7XHJcbnZhciB1aWQgPSAwO1xyXG5mdW5jdGlvbiBuZXh0VWlkKCkge1xyXG4gICAgcmV0dXJuICsrdWlkO1xyXG59XHJcbmZ1bmN0aW9uIGhhc2hLZXkob2JqLCBuZXh0VWlkRm4pIHtcclxuICAgIHZhciBrZXkgPSBvYmogJiYgb2JqLiQkaGFzaEtleTtcclxuICAgIGlmIChrZXkpIHtcclxuICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICBrZXkgPSBvYmouJCRoYXNoS2V5KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBrZXk7XHJcbiAgICB9XHJcbiAgICB2YXIgb2JqVHlwZSA9IHR5cGVvZiBvYmo7XHJcbiAgICBpZiAob2JqVHlwZSA9PSAnZnVuY3Rpb24nIHx8IChvYmpUeXBlID09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCkpIHtcclxuICAgICAgICBrZXkgPSBvYmouJCRoYXNoS2V5ID0gb2JqVHlwZSArICc6JyArIChuZXh0VWlkRm4gfHwgbmV4dFVpZCkoKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIGtleSA9IG9ialR5cGUgKyAnOicgKyBvYmo7XHJcbiAgICB9XHJcbiAgICByZXR1cm4ga2V5O1xyXG59XHJcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcclxuZXhwb3J0cy5kZWZhdWx0ID0gaGFzaEtleTtcclxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uL3R5cGluZ3MvaW5kZXguZC50c1wiIC8+XHJcblwidXNlIHN0cmljdFwiO1xyXG52YXIgbWluRXJyXzEgPSByZXF1aXJlKFwiLi9taW5FcnJcIik7XHJcbnZhciBoYXNoS2V5XzEgPSByZXF1aXJlKFwiLi9oYXNoS2V5XCIpO1xyXG52YXIgY3JlYXRlTWFwXzEgPSByZXF1aXJlKFwiLi9jcmVhdGVNYXBcIik7XHJcbnZhciB1dGlsc18xID0gcmVxdWlyZShcIi4vdXRpbHNcIik7XHJcbnZhciBpc0FycmF5TGlrZSA9IHV0aWxzXzEuZGVmYXVsdC5pc0FycmF5TGlrZTtcclxudmFyIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcclxudmFyIGlzQXJyYXkgPSB1dGlsc18xLmRlZmF1bHQuaXNBcnJheTtcclxudmFyIGlzRnVuY3Rpb24gPSB1dGlsc18xLmRlZmF1bHQuaXNGdW50aW9uO1xyXG52YXIgaXNCbGFua09iamVjdCA9IHV0aWxzXzEuZGVmYXVsdC5pc0JsYW5rT2JqZWN0O1xyXG52YXIgc2xpY2UgPSBbXS5zbGljZTtcclxudmFyIGZvckVhY2ggPSB1dGlsc18xLmRlZmF1bHQuZm9yRWFjaDtcclxudmFyIGdldEJsb2NrTm9kZXMgPSB1dGlsc18xLmRlZmF1bHQuZ2V0QmxvY2tOb2RlcztcclxuYW5ndWxhci5tb2R1bGUoJ25nLXJlcGVhdC1uLWRpcmVjdGl2ZScsIFtdKVxyXG4gICAgLmRpcmVjdGl2ZSgnbmdSZXBlYXROJywgWyckcGFyc2UnLCAnJGFuaW1hdGUnLCAnJGNvbXBpbGUnLCBmdW5jdGlvbiAoJHBhcnNlLCAkYW5pbWF0ZSwgJGNvbXBpbGUpIHtcclxuICAgICAgICB2YXIgTkdfUkVNT1ZFRCA9ICckJE5HX1JFTU9WRUQnO1xyXG4gICAgICAgIHZhciBuZ1JlcGVhdE1pbkVyciA9IG1pbkVycl8xLmRlZmF1bHQoJ25nUmVwZWF0Jyk7XHJcbiAgICAgICAgdmFyIHVwZGF0ZVNjb3BlID0gZnVuY3Rpb24gKHNjb3BlLCBpbmRleCwgdmFsdWVJZGVudGlmaWVyLCB2YWx1ZSwga2V5SWRlbnRpZmllciwga2V5LCBhcnJheUxlbmd0aCkge1xyXG4gICAgICAgICAgICAvLyBUT0RPKHBlcmYpOiBnZW5lcmF0ZSBzZXR0ZXJzIHRvIHNoYXZlIG9mZiB+NDBtcyBvciAxLTEuNSVcclxuICAgICAgICAgICAgc2NvcGVbdmFsdWVJZGVudGlmaWVyXSA9IHZhbHVlO1xyXG4gICAgICAgICAgICBpZiAoa2V5SWRlbnRpZmllcilcclxuICAgICAgICAgICAgICAgIHNjb3BlW2tleUlkZW50aWZpZXJdID0ga2V5O1xyXG4gICAgICAgICAgICBzY29wZS4kaW5kZXggPSBpbmRleDtcclxuICAgICAgICAgICAgc2NvcGUuJGZpcnN0ID0gKGluZGV4ID09PSAwKTtcclxuICAgICAgICAgICAgc2NvcGUuJGxhc3QgPSAoaW5kZXggPT09IChhcnJheUxlbmd0aCAtIDEpKTtcclxuICAgICAgICAgICAgc2NvcGUuJG1pZGRsZSA9ICEoc2NvcGUuJGZpcnN0IHx8IHNjb3BlLiRsYXN0KTtcclxuICAgICAgICAgICAgLy8ganNoaW50IGJpdHdpc2U6IGZhbHNlXHJcbiAgICAgICAgICAgIHNjb3BlLiRvZGQgPSAhKHNjb3BlLiRldmVuID0gKGluZGV4ICYgMSkgPT09IDApO1xyXG4gICAgICAgICAgICAvLyBqc2hpbnQgYml0d2lzZTogdHJ1ZVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdmFyIGdldEJsb2NrU3RhcnQgPSBmdW5jdGlvbiAoYmxvY2spIHtcclxuICAgICAgICAgICAgcmV0dXJuIGJsb2NrLmNsb25lWzBdO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgdmFyIGdldEJsb2NrRW5kID0gZnVuY3Rpb24gKGJsb2NrKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBibG9jay5jbG9uZVtibG9jay5jbG9uZS5sZW5ndGggLSAxXTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHJlc3RyaWN0OiAnQScsXHJcbiAgICAgICAgICAgIG11bHRpRWxlbWVudDogdHJ1ZSxcclxuICAgICAgICAgICAgdHJhbnNjbHVkZTogJ2VsZW1lbnQnLFxyXG4gICAgICAgICAgICBwcmlvcml0eTogMTAwMCxcclxuICAgICAgICAgICAgdGVybWluYWw6IHRydWUsXHJcbiAgICAgICAgICAgICQkdGxiOiB0cnVlLFxyXG4gICAgICAgICAgICBjb21waWxlOiBmdW5jdGlvbiBuZ1JlcGVhdENvbXBpbGUoJGVsZW1lbnQsICRhdHRyKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgbmdSZXBlYXROID0gcGFyc2VJbnQoJGF0dHIubmdSZXBlYXROKTtcclxuICAgICAgICAgICAgICAgIHZhciBhcnJheSA9IG5ldyBBcnJheShuZ1JlcGVhdE4pO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFycmF5W2ldID0gaTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHZhciBleHByZXNzaW9uID0gJ2l0ZW0gaW4gWycgKyBhcnJheS50b1N0cmluZygpICsgJ10nO1xyXG4gICAgICAgICAgICAgICAgdmFyIG5nUmVwZWF0RW5kQ29tbWVudCA9ICRjb21waWxlLiQkY3JlYXRlQ29tbWVudCgnZW5kIG5nUmVwZWF0JywgZXhwcmVzc2lvbik7XHJcbiAgICAgICAgICAgICAgICB2YXIgbWF0Y2ggPSBleHByZXNzaW9uLm1hdGNoKC9eXFxzKihbXFxzXFxTXSs/KVxccytpblxccysoW1xcc1xcU10rPykoPzpcXHMrYXNcXHMrKFtcXHNcXFNdKz8pKT8oPzpcXHMrdHJhY2tcXHMrYnlcXHMrKFtcXHNcXFNdKz8pKT9cXHMqJC8pO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFtYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5nUmVwZWF0TWluRXJyKCdpZXhwJywgXCJFeHBlY3RlZCBleHByZXNzaW9uIGluIGZvcm0gb2YgJ19pdGVtXyBpbiBfY29sbGVjdGlvbl9bIHRyYWNrIGJ5IF9pZF9dJyBidXQgZ290ICd7MH0nLlwiLCBleHByZXNzaW9uKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHZhciBsaHMgPSBtYXRjaFsxXTtcclxuICAgICAgICAgICAgICAgIHZhciByaHMgPSBtYXRjaFsyXTtcclxuICAgICAgICAgICAgICAgIHZhciBhbGlhc0FzID0gbWF0Y2hbM107XHJcbiAgICAgICAgICAgICAgICB2YXIgdHJhY2tCeUV4cCA9IG1hdGNoWzRdO1xyXG4gICAgICAgICAgICAgICAgbWF0Y2ggPSBsaHMubWF0Y2goL14oPzooXFxzKltcXCRcXHddKyl8XFwoXFxzKihbXFwkXFx3XSspXFxzKixcXHMqKFtcXCRcXHddKylcXHMqXFwpKSQvKTtcclxuICAgICAgICAgICAgICAgIGlmICghbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZ1JlcGVhdE1pbkVycignaWlkZXhwJywgXCInX2l0ZW1fJyBpbiAnX2l0ZW1fIGluIF9jb2xsZWN0aW9uXycgc2hvdWxkIGJlIGFuIGlkZW50aWZpZXIgb3IgJyhfa2V5XywgX3ZhbHVlXyknIGV4cHJlc3Npb24sIGJ1dCBnb3QgJ3swfScuXCIsIGxocyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWVJZGVudGlmaWVyID0gbWF0Y2hbM10gfHwgbWF0Y2hbMV07XHJcbiAgICAgICAgICAgICAgICB2YXIga2V5SWRlbnRpZmllciA9IG1hdGNoWzJdO1xyXG4gICAgICAgICAgICAgICAgaWYgKGFsaWFzQXMgJiYgKCEvXlskYS16QS1aX11bJGEtekEtWjAtOV9dKiQvLnRlc3QoYWxpYXNBcykgfHxcclxuICAgICAgICAgICAgICAgICAgICAvXihudWxsfHVuZGVmaW5lZHx0aGlzfFxcJGluZGV4fFxcJGZpcnN0fFxcJG1pZGRsZXxcXCRsYXN0fFxcJGV2ZW58XFwkb2RkfFxcJHBhcmVudHxcXCRyb290fFxcJGlkKSQvLnRlc3QoYWxpYXNBcykpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmdSZXBlYXRNaW5FcnIoJ2JhZGlkZW50JywgXCJhbGlhcyAnezB9JyBpcyBpbnZhbGlkIC0tLSBtdXN0IGJlIGEgdmFsaWQgSlMgaWRlbnRpZmllciB3aGljaCBpcyBub3QgYSByZXNlcnZlZCBuYW1lLlwiLCBhbGlhc0FzKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHZhciB0cmFja0J5RXhwR2V0dGVyLCB0cmFja0J5SWRFeHBGbiwgdHJhY2tCeUlkQXJyYXlGbiwgdHJhY2tCeUlkT2JqRm47XHJcbiAgICAgICAgICAgICAgICB2YXIgaGFzaEZuTG9jYWxzID0geyAkaWQ6IGhhc2hLZXlfMS5kZWZhdWx0IH07XHJcbiAgICAgICAgICAgICAgICBpZiAodHJhY2tCeUV4cCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRyYWNrQnlFeHBHZXR0ZXIgPSAkcGFyc2UodHJhY2tCeUV4cCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICB0cmFja0J5SWRBcnJheUZuID0gZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGhhc2hLZXlfMS5kZWZhdWx0KHZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgICAgIHRyYWNrQnlJZE9iakZuID0gZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ga2V5O1xyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmdSZXBlYXRMaW5rKCRzY29wZSwgJGVsZW1lbnQsICRhdHRyLCBjdHJsLCAkdHJhbnNjbHVkZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0cmFja0J5RXhwR2V0dGVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYWNrQnlJZEV4cEZuID0gZnVuY3Rpb24gKGtleSwgdmFsdWUsIGluZGV4KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhc3NpZ24ga2V5LCB2YWx1ZSwgYW5kICRpbmRleCB0byB0aGUgbG9jYWxzIHNvIHRoYXQgdGhleSBjYW4gYmUgdXNlZCBpbiBoYXNoIGZ1bmN0aW9uc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGtleUlkZW50aWZpZXIpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzaEZuTG9jYWxzW2tleUlkZW50aWZpZXJdID0ga2V5O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzaEZuTG9jYWxzW3ZhbHVlSWRlbnRpZmllcl0gPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc2hGbkxvY2Fscy4kaW5kZXggPSBpbmRleDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cmFja0J5RXhwR2V0dGVyKCRzY29wZSwgaGFzaEZuTG9jYWxzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gU3RvcmUgYSBsaXN0IG9mIGVsZW1lbnRzIGZyb20gcHJldmlvdXMgcnVuLiBUaGlzIGlzIGEgaGFzaCB3aGVyZSBrZXkgaXMgdGhlIGl0ZW0gZnJvbSB0aGVcclxuICAgICAgICAgICAgICAgICAgICAvLyBpdGVyYXRvciwgYW5kIHRoZSB2YWx1ZSBpcyBvYmplY3RzIHdpdGggZm9sbG93aW5nIHByb3BlcnRpZXMuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gICAtIHNjb3BlOiBib3VuZCBzY29wZVxyXG4gICAgICAgICAgICAgICAgICAgIC8vICAgLSBlbGVtZW50OiBwcmV2aW91cyBlbGVtZW50LlxyXG4gICAgICAgICAgICAgICAgICAgIC8vICAgLSBpbmRleDogcG9zaXRpb25cclxuICAgICAgICAgICAgICAgICAgICAvL1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIGFyZSB1c2luZyBuby1wcm90byBvYmplY3Qgc28gdGhhdCB3ZSBkb24ndCBuZWVkIHRvIGd1YXJkIGFnYWluc3QgaW5oZXJpdGVkIHByb3BzIHZpYVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIGhhc093blByb3BlcnR5LlxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBsYXN0QmxvY2tNYXAgPSBjcmVhdGVNYXBfMS5kZWZhdWx0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgLy93YXRjaCBwcm9wc1xyXG4gICAgICAgICAgICAgICAgICAgICRzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKHJocywgZnVuY3Rpb24gbmdSZXBlYXRBY3Rpb24oY29sbGVjdGlvbikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgaW5kZXgsIGxlbmd0aCwgcHJldmlvdXNOb2RlID0gJGVsZW1lbnRbMF0sIC8vIG5vZGUgdGhhdCBjbG9uZWQgbm9kZXMgc2hvdWxkIGJlIGluc2VydGVkIGFmdGVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluaXRpYWxpemVkIHRvIHRoZSBjb21tZW50IG5vZGUgYW5jaG9yXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5leHROb2RlLCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU2FtZSBhcyBsYXN0QmxvY2tNYXAgYnV0IGl0IGhhcyB0aGUgY3VycmVudCBzdGF0ZS4gSXQgd2lsbCBiZWNvbWUgdGhlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGxhc3RCbG9ja01hcCBvbiB0aGUgbmV4dCBpdGVyYXRpb24uXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5leHRCbG9ja01hcCA9IGNyZWF0ZU1hcF8xLmRlZmF1bHQoKSwgY29sbGVjdGlvbkxlbmd0aCwga2V5LCB2YWx1ZSwgLy8ga2V5L3ZhbHVlIG9mIGl0ZXJhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFja0J5SWQsIHRyYWNrQnlJZEZuLCBjb2xsZWN0aW9uS2V5cywgYmxvY2ssIC8vIGxhc3Qgb2JqZWN0IGluZm9ybWF0aW9uIHtzY29wZSwgZWxlbWVudCwgaWR9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5leHRCbG9ja09yZGVyLCBlbGVtZW50c1RvUmVtb3ZlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxpYXNBcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJHNjb3BlW2FsaWFzQXNdID0gY29sbGVjdGlvbjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNBcnJheUxpa2UoY29sbGVjdGlvbikpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbGxlY3Rpb25LZXlzID0gY29sbGVjdGlvbjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyYWNrQnlJZEZuID0gdHJhY2tCeUlkRXhwRm4gfHwgdHJhY2tCeUlkQXJyYXlGbjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyYWNrQnlJZEZuID0gdHJhY2tCeUlkRXhwRm4gfHwgdHJhY2tCeUlkT2JqRm47XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiBvYmplY3QsIGV4dHJhY3Qga2V5cywgaW4gZW51bWVyYXRpb24gb3JkZXIsIHVuc29ydGVkXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xsZWN0aW9uS2V5cyA9IFtdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaXRlbUtleSBpbiBjb2xsZWN0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwoY29sbGVjdGlvbiwgaXRlbUtleSkgJiYgaXRlbUtleS5jaGFyQXQoMCkgIT09ICckJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xsZWN0aW9uS2V5cy5wdXNoKGl0ZW1LZXkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xsZWN0aW9uTGVuZ3RoID0gY29sbGVjdGlvbktleXMubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXh0QmxvY2tPcmRlciA9IG5ldyBBcnJheShjb2xsZWN0aW9uTGVuZ3RoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbG9jYXRlIGV4aXN0aW5nIGl0ZW1zXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaW5kZXggPSAwOyBpbmRleCA8IGNvbGxlY3Rpb25MZW5ndGg7IGluZGV4KyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IChjb2xsZWN0aW9uID09PSBjb2xsZWN0aW9uS2V5cykgPyBpbmRleCA6IGNvbGxlY3Rpb25LZXlzW2luZGV4XTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gY29sbGVjdGlvbltrZXldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJhY2tCeUlkID0gdHJhY2tCeUlkRm4oa2V5LCB2YWx1ZSwgaW5kZXgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxhc3RCbG9ja01hcFt0cmFja0J5SWRdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZm91bmQgcHJldmlvdXNseSBzZWVuIGJsb2NrXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYmxvY2sgPSBsYXN0QmxvY2tNYXBbdHJhY2tCeUlkXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgbGFzdEJsb2NrTWFwW3RyYWNrQnlJZF07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dEJsb2NrTWFwW3RyYWNrQnlJZF0gPSBibG9jaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXh0QmxvY2tPcmRlcltpbmRleF0gPSBibG9jaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKG5leHRCbG9ja01hcFt0cmFja0J5SWRdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgY29sbGlzaW9uIGRldGVjdGVkLiByZXN0b3JlIGxhc3RCbG9ja01hcCBhbmQgdGhyb3cgYW4gZXJyb3JcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JFYWNoKG5leHRCbG9ja09yZGVyLCBmdW5jdGlvbiAoYmxvY2spIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJsb2NrICYmIGJsb2NrLnNjb3BlKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdEJsb2NrTWFwW2Jsb2NrLmlkXSA9IGJsb2NrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5nUmVwZWF0TWluRXJyKCdkdXBlcycsIFwiRHVwbGljYXRlcyBpbiBhIHJlcGVhdGVyIGFyZSBub3QgYWxsb3dlZC4gVXNlICd0cmFjayBieScgZXhwcmVzc2lvbiB0byBzcGVjaWZ5IHVuaXF1ZSBrZXlzLiBSZXBlYXRlcjogezB9LCBEdXBsaWNhdGUga2V5OiB7MX0sIER1cGxpY2F0ZSB2YWx1ZTogezJ9XCIsIGV4cHJlc3Npb24sIHRyYWNrQnlJZCwgdmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV3IG5ldmVyIGJlZm9yZSBzZWVuIGJsb2NrXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dEJsb2NrT3JkZXJbaW5kZXhdID0geyBpZDogdHJhY2tCeUlkLCBzY29wZTogdW5kZWZpbmVkLCBjbG9uZTogdW5kZWZpbmVkIH07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dEJsb2NrTWFwW3RyYWNrQnlJZF0gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBsZWZ0b3ZlciBpdGVtc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBibG9ja0tleSBpbiBsYXN0QmxvY2tNYXApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJsb2NrID0gbGFzdEJsb2NrTWFwW2Jsb2NrS2V5XTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzVG9SZW1vdmUgPSBnZXRCbG9ja05vZGVzKGJsb2NrLmNsb25lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICRhbmltYXRlLmxlYXZlKGVsZW1lbnRzVG9SZW1vdmUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVsZW1lbnRzVG9SZW1vdmVbMF0ucGFyZW50Tm9kZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBlbGVtZW50IHdhcyBub3QgcmVtb3ZlZCB5ZXQgYmVjYXVzZSBvZiBwZW5kaW5nIGFuaW1hdGlvbiwgbWFyayBpdCBhcyBkZWxldGVkXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc28gdGhhdCB3ZSBjYW4gaWdub3JlIGl0IGxhdGVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpbmRleCA9IDAsIGxlbmd0aCA9IGVsZW1lbnRzVG9SZW1vdmUubGVuZ3RoOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50c1RvUmVtb3ZlW2luZGV4XVtOR19SRU1PVkVEXSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYmxvY2suc2NvcGUuJGRlc3Ryb3koKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhcmUgbm90IHVzaW5nIGZvckVhY2ggZm9yIHBlcmYgcmVhc29ucyAodHJ5aW5nIHRvIGF2b2lkICNjYWxsKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGluZGV4ID0gMDsgaW5kZXggPCBjb2xsZWN0aW9uTGVuZ3RoOyBpbmRleCsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSAoY29sbGVjdGlvbiA9PT0gY29sbGVjdGlvbktleXMpID8gaW5kZXggOiBjb2xsZWN0aW9uS2V5c1tpbmRleF07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IGNvbGxlY3Rpb25ba2V5XTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJsb2NrID0gbmV4dEJsb2NrT3JkZXJbaW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJsb2NrLnNjb3BlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSBhbHJlYWR5IHNlZW4gdGhpcyBvYmplY3QsIHRoZW4gd2UgbmVlZCB0byByZXVzZSB0aGVcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhc3NvY2lhdGVkIHNjb3BlL2VsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXh0Tm9kZSA9IHByZXZpb3VzTm9kZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBza2lwIG5vZGVzIHRoYXQgYXJlIGFscmVhZHkgcGVuZGluZyByZW1vdmFsIHZpYSBsZWF2ZSBhbmltYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5leHROb2RlID0gbmV4dE5vZGUubmV4dFNpYmxpbmc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSB3aGlsZSAobmV4dE5vZGUgJiYgbmV4dE5vZGVbTkdfUkVNT1ZFRF0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChnZXRCbG9ja1N0YXJ0KGJsb2NrKSAhPSBuZXh0Tm9kZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBleGlzdGluZyBpdGVtIHdoaWNoIGdvdCBtb3ZlZFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAkYW5pbWF0ZS5tb3ZlKGdldEJsb2NrTm9kZXMoYmxvY2suY2xvbmUpLCBudWxsLCBwcmV2aW91c05vZGUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2aW91c05vZGUgPSBnZXRCbG9ja0VuZChibG9jayk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlU2NvcGUoYmxvY2suc2NvcGUsIGluZGV4LCB2YWx1ZUlkZW50aWZpZXIsIHZhbHVlLCBrZXlJZGVudGlmaWVyLCBrZXksIGNvbGxlY3Rpb25MZW5ndGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV3IGl0ZW0gd2hpY2ggd2UgZG9uJ3Qga25vdyBhYm91dFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICR0cmFuc2NsdWRlKGZ1bmN0aW9uIG5nUmVwZWF0VHJhbnNjbHVkZShjbG9uZSwgc2NvcGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYmxvY2suc2NvcGUgPSBzY29wZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaHR0cDovL2pzcGVyZi5jb20vY2xvbmUtdnMtY3JlYXRlY29tbWVudFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgZW5kTm9kZSA9IG5nUmVwZWF0RW5kQ29tbWVudC5jbG9uZU5vZGUoZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbG9uZVtjbG9uZS5sZW5ndGgrK10gPSBlbmROb2RlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAkYW5pbWF0ZS5lbnRlcihjbG9uZSwgbnVsbCwgcHJldmlvdXNOb2RlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNOb2RlID0gZW5kTm9kZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTm90ZTogV2Ugb25seSBuZWVkIHRoZSBmaXJzdC9sYXN0IG5vZGUgb2YgdGhlIGNsb25lZCBub2Rlcy5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSG93ZXZlciwgd2UgbmVlZCB0byBrZWVwIHRoZSByZWZlcmVuY2UgdG8gdGhlIGpxbGl0ZSB3cmFwcGVyIGFzIGl0IG1pZ2h0IGJlIGNoYW5nZWQgbGF0ZXJcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gYnkgYSBkaXJlY3RpdmUgd2l0aCB0ZW1wbGF0ZVVybCB3aGVuIGl0cyB0ZW1wbGF0ZSBhcnJpdmVzLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBibG9jay5jbG9uZSA9IGNsb25lO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXh0QmxvY2tNYXBbYmxvY2suaWRdID0gYmxvY2s7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZVNjb3BlKGJsb2NrLnNjb3BlLCBpbmRleCwgdmFsdWVJZGVudGlmaWVyLCB2YWx1ZSwga2V5SWRlbnRpZmllciwga2V5LCBjb2xsZWN0aW9uTGVuZ3RoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsYXN0QmxvY2tNYXAgPSBuZXh0QmxvY2tNYXA7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1dKTtcclxuIiwiXCJ1c2Ugc3RyaWN0XCI7XHJcbnZhciB1dGlsc18xID0gcmVxdWlyZShcIi4vdXRpbHNcIik7XHJcbnZhciBpc0FycmF5TGlrZSA9IHV0aWxzXzEuZGVmYXVsdC5pc0FycmF5TGlrZTtcclxudmFyIGlzVW5kZWZpbmVkID0gdXRpbHNfMS5kZWZhdWx0LmlzVW5kZWZpbmVkO1xyXG52YXIgaXNXaW5kb3cgPSB1dGlsc18xLmRlZmF1bHQuaXNXaW5kb3c7XHJcbnZhciBpc1Njb3BlID0gdXRpbHNfMS5kZWZhdWx0LmlzU2NvcGU7XHJcbnZhciBpc09iamVjdCA9IHV0aWxzXzEuZGVmYXVsdC5pc09iamVjdDtcclxuZnVuY3Rpb24gdG9Kc29uUmVwbGFjZXIoa2V5LCB2YWx1ZSkge1xyXG4gICAgdmFyIHZhbCA9IHZhbHVlO1xyXG4gICAgaWYgKHR5cGVvZiBrZXkgPT09ICdzdHJpbmcnICYmIGtleS5jaGFyQXQoMCkgPT09ICckJyAmJiBrZXkuY2hhckF0KDEpID09PSAnJCcpIHtcclxuICAgICAgICB2YWwgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmIChpc1dpbmRvdyh2YWx1ZSkpIHtcclxuICAgICAgICB2YWwgPSAnJFdJTkRPVyc7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmICh2YWx1ZSAmJiB3aW5kb3cuZG9jdW1lbnQgPT09IHZhbHVlKSB7XHJcbiAgICAgICAgdmFsID0gJyRET0NVTUVOVCc7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmIChpc1Njb3BlKHZhbHVlKSkge1xyXG4gICAgICAgIHZhbCA9ICckU0NPUEUnO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHZhbDtcclxufVxyXG4vKiBnbG9iYWwgdG9EZWJ1Z1N0cmluZzogdHJ1ZSAqL1xyXG5mdW5jdGlvbiBzZXJpYWxpemVPYmplY3Qob2JqKSB7XHJcbiAgICB2YXIgc2VlbiA9IFtdO1xyXG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG9iaiwgZnVuY3Rpb24gKGtleSwgdmFsKSB7XHJcbiAgICAgICAgdmFsID0gdG9Kc29uUmVwbGFjZXIoa2V5LCB2YWwpO1xyXG4gICAgICAgIGlmIChpc09iamVjdCh2YWwpKSB7XHJcbiAgICAgICAgICAgIGlmIChzZWVuLmluZGV4T2YodmFsKSA+PSAwKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuICcuLi4nO1xyXG4gICAgICAgICAgICBzZWVuLnB1c2godmFsKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHZhbDtcclxuICAgIH0pO1xyXG59XHJcbmZ1bmN0aW9uIHRvRGVidWdTdHJpbmcob2JqKSB7XHJcbiAgICBpZiAodHlwZW9mIG9iaiA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHJldHVybiBvYmoudG9TdHJpbmcoKS5yZXBsYWNlKC8gXFx7W1xcc1xcU10qJC8sICcnKTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKGlzVW5kZWZpbmVkKG9iaikpIHtcclxuICAgICAgICByZXR1cm4gJ3VuZGVmaW5lZCc7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmICh0eXBlb2Ygb2JqICE9PSAnc3RyaW5nJykge1xyXG4gICAgICAgIHJldHVybiBzZXJpYWxpemVPYmplY3Qob2JqKTtcclxuICAgIH1cclxuICAgIHJldHVybiBvYmo7XHJcbn1cclxuZnVuY3Rpb24gZGVmYXVsdF8xKG1vZHVsZSwgRXJyb3JDb25zdHJ1Y3Rvcikge1xyXG4gICAgRXJyb3JDb25zdHJ1Y3RvciA9IEVycm9yQ29uc3RydWN0b3IgfHwgRXJyb3I7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHZhciBTS0lQX0lOREVYRVMgPSAyO1xyXG4gICAgICAgIHZhciB0ZW1wbGF0ZUFyZ3MgPSBhcmd1bWVudHMsIGNvZGUgPSB0ZW1wbGF0ZUFyZ3NbMF0sIG1lc3NhZ2UgPSAnWycgKyAobW9kdWxlID8gbW9kdWxlICsgJzonIDogJycpICsgY29kZSArICddICcsIHRlbXBsYXRlID0gdGVtcGxhdGVBcmdzWzFdLCBwYXJhbVByZWZpeCwgaTtcclxuICAgICAgICBtZXNzYWdlICs9IHRlbXBsYXRlLnJlcGxhY2UoL1xce1xcZCtcXH0vZywgZnVuY3Rpb24gKG1hdGNoKSB7XHJcbiAgICAgICAgICAgIHZhciBpbmRleCA9ICttYXRjaC5zbGljZSgxLCAtMSksIHNoaWZ0ZWRJbmRleCA9IGluZGV4ICsgU0tJUF9JTkRFWEVTO1xyXG4gICAgICAgICAgICBpZiAoc2hpZnRlZEluZGV4IDwgdGVtcGxhdGVBcmdzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRvRGVidWdTdHJpbmcodGVtcGxhdGVBcmdzW3NoaWZ0ZWRJbmRleF0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDtcclxuICAgICAgICB9KTtcclxuICAgICAgICBtZXNzYWdlICs9ICdcXG5odHRwOi8vZXJyb3JzLmFuZ3VsYXJqcy5vcmcvMS41LjgvJyArXHJcbiAgICAgICAgICAgIChtb2R1bGUgPyBtb2R1bGUgKyAnLycgOiAnJykgKyBjb2RlO1xyXG4gICAgICAgIGZvciAoaSA9IFNLSVBfSU5ERVhFUywgcGFyYW1QcmVmaXggPSAnPyc7IGkgPCB0ZW1wbGF0ZUFyZ3MubGVuZ3RoOyBpKyssIHBhcmFtUHJlZml4ID0gJyYnKSB7XHJcbiAgICAgICAgICAgIG1lc3NhZ2UgKz0gcGFyYW1QcmVmaXggKyAncCcgKyAoaSAtIFNLSVBfSU5ERVhFUykgKyAnPScgK1xyXG4gICAgICAgICAgICAgICAgZW5jb2RlVVJJQ29tcG9uZW50KHRvRGVidWdTdHJpbmcodGVtcGxhdGVBcmdzW2ldKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBuZXcgRXJyb3JDb25zdHJ1Y3RvcihtZXNzYWdlKTtcclxuICAgIH07XHJcbn1cclxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xyXG5leHBvcnRzLmRlZmF1bHQgPSBkZWZhdWx0XzE7XHJcbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi90eXBpbmdzL2luZGV4LmQudHNcIiAvPlxyXG5cInVzZSBzdHJpY3RcIjtcclxuZnVuY3Rpb24gaXNBcnJheUxpa2Uob2JqKSB7XHJcbiAgICAvLyBgbnVsbGAsIGB1bmRlZmluZWRgIGFuZCBgd2luZG93YCBhcmUgbm90IGFycmF5LWxpa2VcclxuICAgIGlmIChvYmogPT0gbnVsbCB8fCBpc1dpbmRvdyhvYmopKVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIC8vIGFycmF5cywgc3RyaW5ncyBhbmQgalF1ZXJ5L2pxTGl0ZSBvYmplY3RzIGFyZSBhcnJheSBsaWtlXHJcbiAgICAvLyAqIGpxTGl0ZSBpcyBlaXRoZXIgdGhlIGpRdWVyeSBvciBqcUxpdGUgY29uc3RydWN0b3IgZnVuY3Rpb25cclxuICAgIC8vICogd2UgaGF2ZSB0byBjaGVjayB0aGUgZXhpc3RlbmNlIG9mIGpxTGl0ZSBmaXJzdCBhcyB0aGlzIG1ldGhvZCBpcyBjYWxsZWRcclxuICAgIC8vICAgdmlhIHRoZSBmb3JFYWNoIG1ldGhvZCB3aGVuIGNvbnN0cnVjdGluZyB0aGUganFMaXRlIG9iamVjdCBpbiB0aGUgZmlyc3QgcGxhY2VcclxuICAgIGlmIChpc0FycmF5KG9iaikgfHwgaXNTdHJpbmcob2JqKSlcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIC8vIFN1cHBvcnQ6IGlPUyA4LjIgKG5vdCByZXByb2R1Y2libGUgaW4gc2ltdWxhdG9yKVxyXG4gICAgLy8gXCJsZW5ndGhcIiBpbiBvYmogdXNlZCB0byBwcmV2ZW50IEpJVCBlcnJvciAoZ2gtMTE1MDgpXHJcbiAgICB2YXIgbGVuZ3RoID0gXCJsZW5ndGhcIiBpbiBPYmplY3Qob2JqKSAmJiBvYmoubGVuZ3RoO1xyXG4gICAgLy8gTm9kZUxpc3Qgb2JqZWN0cyAod2l0aCBgaXRlbWAgbWV0aG9kKSBhbmRcclxuICAgIC8vIG90aGVyIG9iamVjdHMgd2l0aCBzdWl0YWJsZSBsZW5ndGggY2hhcmFjdGVyaXN0aWNzIGFyZSBhcnJheS1saWtlXHJcbiAgICByZXR1cm4gaXNOdW1iZXIobGVuZ3RoKSAmJlxyXG4gICAgICAgIChsZW5ndGggPj0gMCAmJiAoKGxlbmd0aCAtIDEpIGluIG9iaiB8fCBvYmogaW5zdGFuY2VvZiBBcnJheSkgfHwgdHlwZW9mIG9iai5pdGVtID09ICdmdW5jdGlvbicpO1xyXG59XHJcbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKHZhbHVlKSB7IHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnOyB9XHJcbmZ1bmN0aW9uIGlzV2luZG93KG9iaikge1xyXG4gICAgcmV0dXJuIG9iaiAmJiBvYmoud2luZG93ID09PSBvYmo7XHJcbn1cclxuZnVuY3Rpb24gaXNTY29wZShvYmopIHtcclxuICAgIHJldHVybiBvYmogJiYgb2JqLiRldmFsQXN5bmMgJiYgb2JqLiR3YXRjaDtcclxufVxyXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XHJcbmZ1bmN0aW9uIGlzU3RyaW5nKHZhbHVlKSB7IHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnOyB9XHJcbmZ1bmN0aW9uIGlzTnVtYmVyKHZhbHVlKSB7IHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInOyB9XHJcbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7IHJldHVybiB2YWx1ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnOyB9XHJcbmZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsdWUpIHsgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJzsgfVxyXG5mdW5jdGlvbiBpc0JsYW5rT2JqZWN0KHZhbHVlKSB7XHJcbiAgICByZXR1cm4gdmFsdWUgIT09IG51bGwgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiAhZ2V0UHJvdG90eXBlT2YodmFsdWUpO1xyXG59XHJcbnZhciBnZXRQcm90b3R5cGVPZiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZjtcclxudmFyIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcclxudmFyIHNsaWNlID0gW10uc2xpY2U7XHJcbmZ1bmN0aW9uIGZvckVhY2gob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xyXG4gICAgdmFyIGtleSwgbGVuZ3RoO1xyXG4gICAgaWYgKG9iaikge1xyXG4gICAgICAgIGlmIChpc0Z1bmN0aW9uKG9iaikpIHtcclxuICAgICAgICAgICAgZm9yIChrZXkgaW4gb2JqKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBOZWVkIHRvIGNoZWNrIGlmIGhhc093blByb3BlcnR5IGV4aXN0cyxcclxuICAgICAgICAgICAgICAgIC8vIGFzIG9uIElFOCB0aGUgcmVzdWx0IG9mIHF1ZXJ5U2VsZWN0b3JBbGwgaXMgYW4gb2JqZWN0IHdpdGhvdXQgYSBoYXNPd25Qcm9wZXJ0eSBmdW5jdGlvblxyXG4gICAgICAgICAgICAgICAgaWYgKGtleSAhPSAncHJvdG90eXBlJyAmJiBrZXkgIT0gJ2xlbmd0aCcgJiYga2V5ICE9ICduYW1lJyAmJiAoIW9iai5oYXNPd25Qcm9wZXJ0eSB8fCBvYmouaGFzT3duUHJvcGVydHkoa2V5KSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoaXNBcnJheShvYmopIHx8IGlzQXJyYXlMaWtlKG9iaikpIHtcclxuICAgICAgICAgICAgdmFyIGlzUHJpbWl0aXZlID0gdHlwZW9mIG9iaiAhPT0gJ29iamVjdCc7XHJcbiAgICAgICAgICAgIGZvciAoa2V5ID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsga2V5IDwgbGVuZ3RoOyBrZXkrKykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGlzUHJpbWl0aXZlIHx8IGtleSBpbiBvYmopIHtcclxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAob2JqLmZvckVhY2ggJiYgb2JqLmZvckVhY2ggIT09IGZvckVhY2gpIHtcclxuICAgICAgICAgICAgb2JqLmZvckVhY2goaXRlcmF0b3IsIGNvbnRleHQsIG9iaik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKGlzQmxhbmtPYmplY3Qob2JqKSkge1xyXG4gICAgICAgICAgICAvLyBjcmVhdGVNYXAoKSBmYXN0IHBhdGggLS0tIFNhZmUgdG8gYXZvaWQgaGFzT3duUHJvcGVydHkgY2hlY2sgYmVjYXVzZSBwcm90b3R5cGUgY2hhaW4gaXMgZW1wdHlcclxuICAgICAgICAgICAgZm9yIChrZXkgaW4gb2JqKSB7XHJcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIG9iai5oYXNPd25Qcm9wZXJ0eSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAvLyBTbG93IHBhdGggZm9yIG9iamVjdHMgaW5oZXJpdGluZyBPYmplY3QucHJvdG90eXBlLCBoYXNPd25Qcm9wZXJ0eSBjaGVjayBuZWVkZWRcclxuICAgICAgICAgICAgZm9yIChrZXkgaW4gb2JqKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIFNsb3cgcGF0aCBmb3Igb2JqZWN0cyB3aGljaCBkbyBub3QgaGF2ZSBhIG1ldGhvZCBgaGFzT3duUHJvcGVydHlgXHJcbiAgICAgICAgICAgIGZvciAoa2V5IGluIG9iaikge1xyXG4gICAgICAgICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5XSwga2V5LCBvYmopO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG9iajtcclxufVxyXG5mdW5jdGlvbiBnZXRCbG9ja05vZGVzKG5vZGVzKSB7XHJcbiAgICAvLyBUT0RPKHBlcmYpOiB1cGRhdGUgYG5vZGVzYCBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgbmV3IG9iamVjdD9cclxuICAgIHZhciBub2RlID0gbm9kZXNbMF07XHJcbiAgICB2YXIgZW5kTm9kZSA9IG5vZGVzW25vZGVzLmxlbmd0aCAtIDFdO1xyXG4gICAgdmFyIGJsb2NrTm9kZXM7XHJcbiAgICBmb3IgKHZhciBpID0gMTsgbm9kZSAhPT0gZW5kTm9kZSAmJiAobm9kZSA9IG5vZGUubmV4dFNpYmxpbmcpOyBpKyspIHtcclxuICAgICAgICBpZiAoYmxvY2tOb2RlcyB8fCBub2Rlc1tpXSAhPT0gbm9kZSkge1xyXG4gICAgICAgICAgICBpZiAoIWJsb2NrTm9kZXMpIHtcclxuICAgICAgICAgICAgICAgIGJsb2NrTm9kZXMgPSBqcUxpdGUoc2xpY2UuY2FsbChub2RlcywgMCwgaSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJsb2NrTm9kZXMucHVzaChub2RlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYmxvY2tOb2RlcyB8fCBub2RlcztcclxufVxyXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XHJcbmV4cG9ydHMuZGVmYXVsdCA9IHtcclxuICAgIGlzQXJyYXlMaWtlOiBpc0FycmF5TGlrZSxcclxuICAgIGlzVW5kZWZpbmVkOiBpc1VuZGVmaW5lZCxcclxuICAgIGlzV2luZG93OiBpc1dpbmRvdyxcclxuICAgIGlzU2NvcGU6IGlzU2NvcGUsXHJcbiAgICBpc0FycmF5OiBpc0FycmF5LFxyXG4gICAgaXNTdHJpbmc6IGlzU3RyaW5nLFxyXG4gICAgaXNPYmplY3Q6IGlzT2JqZWN0LFxyXG4gICAgaXNGdW50aW9uOiBpc0Z1bmN0aW9uLFxyXG4gICAgaXNCbGFua09iamVjdDogaXNCbGFua09iamVjdCxcclxuICAgIGZvckVhY2g6IGZvckVhY2gsXHJcbiAgICBnZXRCbG9ja05vZGVzOiBnZXRCbG9ja05vZGVzXHJcbn07XHJcbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi90eXBpbmdzL2luZGV4LmQudHNcIiAvPlxuXG5pbXBvcnQgXCJuZy1yZXBlYXQtblwiO1xuXG5hbmd1bGFyLm1vZHVsZShcIm5nLXJhdGluZy1kaXJlY3RpdmVcIiwgW1wibmctcmVwZWF0LW4tZGlyZWN0aXZlXCJdKVxuICAgIC5kaXJlY3RpdmUoJ25nUmF0aW5nJywgWyckcGFyc2UnLCAnJGFuaW1hdGUnLCAnJGNvbXBpbGUnLCBmdW5jdGlvbiAoJHBhcnNlLCAkYW5pbWF0ZSwgJGNvbXBpbGUpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgICAgICB0ZW1wbGF0ZTogYDxkaXYgY2xhc3M9XCJuZy1yYXRpbmctY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cIm5nLXJhdGluZy1pdGVtXCIgbmctcmVwZWF0LW49XCI1XCIgbmctY2xpY2s9XCJjaGFuZ2VSYXRpbmcoJGluZGV4KVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpIGNsYXNzPVwiZnVsbCBmYSBmYS1zdGFyXCIgbmctc2hvdz1cIigkaW5kZXggKyAxKSA8PSBiaW5kUmF0aW5nXCI+PC9pPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpIGNsYXNzPVwiaGFsZiBmYSBmYS1zdGFyLWhhbGZcIiBuZy1zaG93PVwiKCRpbmRleCArIDAuNSkgPT0gYmluZFJhdGluZ1wiPjwvaT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aSBjbGFzcz1cImVtcHR5IGZhIGZhLXN0YXItb1wiIG5nLXNob3c9XCIkaW5kZXggPj0gYmluZFJhdGluZ1wiPjwvaT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+YCxcbiAgICAgICAgICAgIGxpbms6IGZ1bmN0aW9uICgkc2NvcGUsICRlbGVtZW50LCAkYXR0cmlidXRlcywgY29udHJvbGxlcikge1xuICAgICAgICAgICAgICAgIHZhciBnZXR0ZXIgPSAkcGFyc2UoJGF0dHJpYnV0ZXMubmdNb2RlbCk7XG4gICAgICAgICAgICAgICAgdmFyIHNldHRlciA9IGdldHRlci5hc3NpZ247XG4gICAgICAgICAgICAgICAgJHNjb3BlLiR3YXRjaCgkYXR0cmlidXRlcy5uZ01vZGVsLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5iaW5kUmF0aW5nID0gZ2V0dGVyKCRzY29wZSkgfHwgMDtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICRzY29wZS5jaGFuZ2VSYXRpbmcgPSBmdW5jdGlvbiAoJGluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICgoJGluZGV4ICsgMSkgIT0gJHNjb3BlLmJpbmRSYXRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS5iaW5kUmF0aW5nID0gJGluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS5iaW5kUmF0aW5nID0gJGluZGV4ICsgMC41O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNldHRlcigkc2NvcGUsICRzY29wZS5iaW5kUmF0aW5nKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1dKTtcbiIsIiJdfQ==
