define(['Util', 'data/Associative'], function (Util, Associative) {

  /* ---------------- */
  /* Private helpers. */
  /* ---------------- */

  var PREFIX_SIZE = 32, SUFFIX_SIZE = 32;

  var updateArray, updateBackingArray, fromArrays;

  updateArray = function (arr, f) {
    var newArray = arr.slice(0);
    return f(newArray);
  };

  updateBackingArray = function (vector, f) {
    return new Vector(updateArray(vector._backingArray, f));
  };

  fromArrays = function (var_args) {
    return new Vector([].concat.apply([], arguments));
  };

  var equals, isInstance;

  equals = function (vec1, vec2) {
    if (vec1 === vec2) {
      return true;
    } else {
      if (vec1.size() !== vec2.size()) {
        return false;
      } else {
        var isAssociative = vec1.isAssociative;
        var iter1 = vec1.iter(), iter2 = vec2.iter();
        var result = true;
        while (iter1.hasNext()) {
          var value1 = iter1.next(), value2 = iter2.next();
          var equal = isAssociative(value1) && isAssociative(value2) ? value1.equals(value2) : value1 === value2;
          if (!equal) {
            result = false;
            break;
          }
        }
        return result;
      }
    }
  };

  isInstance = function (obj) {
    return obj instanceof Vector;
  };

  /* -------------------- */
  /* Vector wrapper type. */
  /* -------------------- */

  /** Vector constructor.
   * @param {Array} backingArray backing array
   * @param {Array} [prefixArray] prefix array
   * @param {Array} [suffixArray] suffix array
   * @public
   * @class Vector
   * @augments Associative
   * @classdesc Simple immutable vector implementation based on array copying.
   * <p>For efficiency prefix and suffix arrays of max 32 elements are used,
   * so full collection copying is only performed:
   * <ul>
   *   <li>on fill if there is not enough space in suffix;</li>
   *   <li>on prepend if prefix is full;</li>
   *   <li>on append if suffix is full;</li>
   *   <li>on update if new element goes to the suffix and its size is exceeded;</li>
   *   <li>on insert if element goes to the middle;</li>
   *   <li>on insert if element goes to the prefix and its index is greater than prefix length;</li>
   *   <li>on insert if element goes to the suffix and its size is exceeded;</li>
   *   <li>on join.</li>
   * </ul>
   * This approach makes vector almost as fast as Mori's vector on prepend,
   * slightly faster than Mori's on append, and 5 times faster on get.
   * Iteration, map, reduce, and similar are also better. */
  var Vector = function (backingArray, prefixArray, suffixArray) {
    if (prefixArray && prefixArray.length > PREFIX_SIZE) {
      throw new Error('Invalid prefix array length');
    }
    if (suffixArray && suffixArray.length > SUFFIX_SIZE) {
      throw new Error('Invalid suffix array length');
    }

    /** @private */
    this._backingArray = backingArray;

    /** @private */
    this._prefixArray = prefixArray || [];
    /** @private */
    this._suffixArray = suffixArray || [];
  };

  Vector.prototype = Object.freeze( /** @lends Vector.prototype */ {

    // common methods

    /** Fill vector from variable-length arguments list.
     * Effectively concatenates this vector elements with arguments list.
     * @param {...Object} var_args arguments list in form of 'value1, value2, ...' values
     * @return {Vector} new vector instance, original is unaffected
     * @public */
    fill: function (var_args) {
      if (arguments.length === 0) {
        return this;
      } else {
        var args = Array.prototype.slice.call(arguments);

        if (this.isEmpty()) {
          return new Vector(args);
        } else {
          var suffixSize = this._suffixArray.length;
          if (suffixSize + arguments.length <= SUFFIX_SIZE) {
            return new Vector(
              this._backingArray,
              this._prefixArray,
              updateArray(this._suffixArray, function (arr) {
                return arr.concat(args);
              })
            );
          } else {
            return fromArrays(this._prefixArray, this._backingArray, this._suffixArray, args);
          }
        }

      }
    },

    /** Check whether vector is empty.
     * @return {Boolean} */
    isEmpty: function () {
      return this.size() === 0;
    },

    /** Get value by index.
     * @param {Number} index index
     * @return {Object} value or null */
    get: function (index) {
      var result;
      if (index < this._prefixArray.length) {
        result = this._prefixArray[index];
      } else if (index < this._prefixArray.length + this._backingArray.length) {
        result = this._backingArray[index - this._prefixArray.length];
      } else {
        result = this._suffixArray[index - (this._prefixArray.length + this._backingArray.length)];
      }
      return Util.undefinedOrNull(result) ? null : result;
    },

    /** Check if vector contains a mapping for the specified index.
     * @param {Number} index index
     * @return {Boolean} */
    contains: function (index) {
      return index < this.size();
    },

    /** Update existing value or create new mapping.
     * If index is out of range, f will be called without arguments and the result will be put at index position,
     * filling possible gaps with undefined values.
     * @param {Number} index index
     * @param {Function} f update function
     * @return {Vector} new vector instance, original is unaffected */
    update: function (index, f) {
      var self = this;
      if (self.contains(index)) {
        var originalValue = self.get(index);
        var updatedValue = f(originalValue);
        if (updatedValue === originalValue) {
          return self;
        } else {

          if (index < self._prefixArray.length) {
            return new Vector(
              self._backingArray,
              updateArray(self._prefixArray, function (arr) {
                arr[index] = updatedValue;
                return arr;
              }),
              self._suffixArray
            );
          } else if (index < self._prefixArray.length + self._backingArray.length) {
            return new Vector(
              updateArray(self._backingArray, function (arr) {
                arr[index - self._prefixArray.length] = updatedValue;
                return arr;
              }.bind(self)),
              self._prefixArray,
              self._suffixArray
            );
          } else {
            return new Vector(
              self._backingArray,
              self._prefixArray,
              updateArray(self._suffixArray, function (arr) {
                arr[index - (self._prefixArray.length + self._backingArray.length)] = updatedValue;
                return arr;
              })
            );
          }

        }
      } else {
        var value = f();

        var suffixIndex = index - (self._prefixArray.length + self._backingArray.length);
        if (suffixIndex < SUFFIX_SIZE) {
          return new Vector(
            this._backingArray,
            this._prefixArray,
            updateArray(this._suffixArray, function (arr) {
              arr[suffixIndex] = value;
              return arr;
            })
          );
        } else {
          var tail = [];
          tail[index - self.size()] = value;
          return fromArrays(this._prefixArray, this._backingArray, this._suffixArray, tail);
        }

      }
    },

    /** Update existing value.
     * @param {Number} index index
     * @param {Function} f update function
     * @return {Vector} new Vector instance, original is unaffected */
    updateIfExists: function (index, f) {
      return this.contains(index) ? this.update(index, f) : this;
    },

    /** Associate an index with a value, filling possible gaps with undefined values.
     * @param {Number} index index
     * @param {*} value value
     * @return {Vector} new vector instance, original is unaffected */
    assoc: function (index, value) {
      return this.update(index, Util.constantly(value));
    },

    /** Remove a value by index.
     * Vector is shrinked starting from the index position,
     * so that all following indices are decremented by one.
     * @param {Number} index index
     * @return {Vector} new Vector instance, original is unaffected */
    dissoc: function (index) {
      return this.contains(index) ?
        updateBackingArray(this, function (arr) {
          arr.splice(index, 1);
          return arr;
        }) :
        this;
    },

    /** Join two vectors.
     * Effectively concatenates this vector with another vector.
     * @param {Vector} anotherVector vector to join with
     * @return {Vector} new vector instance, original vectors are unaffected */
    join: function (anotherVector) {
      if (this.isEmpty()) {
        return anotherVector;
      } else if (anotherVector.isEmpty()) {
        return this;
      } else {
        return fromArrays(
          this._prefixArray, this._backingArray, this._suffixArray,
          anotherVector._prefixArray, anotherVector._backingArray, anotherVector._suffixArray
        );
      }
    },

    /** Create vector iterator.
     * @see Iter
     * @see VectorIter
     * @returns {VectorIter} */
    iter: function () {
      return new VectorIter(this);
    },

    /** Reduce vector left to right with function f and initial value acc.
     * @param {Function} f reduce function accepting following parameters in order: acc, value, index, originalVector
     * @param {*} acc initial value
     * @return {*} reduce result */
    reduce: function (f, acc) {
      var reduceFunction = function (acc, value, index) { return f(acc, value, index, this); }.bind(this);
      return this._prefixArray.reduce(reduceFunction,
        this._backingArray.reduce(reduceFunction,
          this._suffixArray.reduce(reduceFunction, acc)
        )
      );
    },

    /** Map values.
     * @param {Function} f map function
     * @return {Vector} new vector instance, original is unaffected */
    map: function (f) {
      if (this.isEmpty()) {
        return this;
      } else {
        var mapFunction = function (value, index) { return f(value, index, this); }.bind(this);
        return new Vector(
            this._backingArray.length > 0 ? this._backingArray.map(mapFunction) : this._backingArray,
            this._prefixArray.length > 0 ? this._prefixArray.map(mapFunction) : this._prefixArray,
            this._suffixArray.length > 0 ? this._suffixArray.map(mapFunction) : this._suffixArray
        );
      }
    },

    /** Execute side-effecting function for each element.
     * @param {Function} f function called for each element */
    foreach: function (f) {
      var foreachFunction = function (value, index) { f(value, index, this); }.bind(this);
      this._prefixArray.forEach(foreachFunction);
      this._backingArray.forEach(foreachFunction);
      this._suffixArray.forEach(foreachFunction);
    },

    /** Filter using a predicate.
     * @param {Function} pred predicate
     * @return {Vector} new vector instance, original is unaffected */
    filter: function (pred) {
      if (this.isEmpty()) {
        return this;
      } else {
        var filterFunction = function (value, index) { return pred(value, index, this); }.bind(this);

        var newBackingArray =
            this._backingArray.length > 0 ? this._backingArray.filter(filterFunction) : this._backingArray;
        var newPrefixArray =
            this._prefixArray.length > 0 ? this._prefixArray.filter(filterFunction) : this._prefixArray;
        var newSuffixArray =
            this._suffixArray.length > 0 ? this._suffixArray.filter(filterFunction) : this._suffixArray;

        if (newBackingArray.length !== this._backingArray.length ||
          newPrefixArray.length !== this._prefixArray.length ||
          newSuffixArray.length !== this._suffixArray.length) {
          return new Vector(newBackingArray, newPrefixArray, newSuffixArray);
        } else {
          return this;
        }
      }
    },

    /** Find element using a predicate.
     * @param {Function} pred predicate
     * @returns {*} found value or null */
    find: function (pred) {
      var findFunction = function (value, index) { return pred(value, index, this); }.bind(this);
      return Util.find(this._prefixArray, findFunction) ||
        Util.find(this._backingArray, findFunction) ||
        Util.find(this._suffixArray, findFunction);
    },

    /** Check whether both vectors contain exactly the same values in order.
     * Associative values are compared recursively, ordinal values are compared using '==='.
     * @param {Vector} otherVector vector to compare with
     * @return {Boolean} */
    equals: function (otherVector) {
      return this === otherVector || (otherVector instanceof Vector && equals(this, otherVector));
    },

    /** Get the number of elements.
     * @return {Number} */
    size: function () {
      return this._prefixArray.length + this._backingArray.length + this._suffixArray.length;
    },

    /** Get human-readable vector representation.
     * @return {String} */
    toString: function () {
      var arrayToString = function (arr) {
        return arr.map(function (x) { return Util.toString(x); }).join(', ');
      };
      var elements = [this._prefixArray, this._backingArray, this._suffixArray]
        .filter(function (arr) { return arr.length > 0; })
        .map(arrayToString);

      return '[' + elements.join(', ') + ']';
    },

    /** Check whether obj is vector instance.
     * @param {*} obj object to check
     * @return {Boolean} */
    isInstance: function (obj) {
      return isInstance(obj);
    },

    // Vector-specific methods

    /** Insert element at the specified index. Following elements indices are incremented by one.
     * @param {Number} index index
     * @param {*} value value
     * @return {Vector} new vector instance, original is unaffected */
    insertAt: function (index, value) {
      var self = this;

      if (index <= self._prefixArray.length) {

        var newPrefixArray = updateArray(self._prefixArray, function (arr) {
          arr.splice(index, 0, value);
          return arr;
        });

        if (newPrefixArray.length <= PREFIX_SIZE) {
          return new Vector(self._backingArray, newPrefixArray, self._suffixArray);
        } else {
          return fromArrays(newPrefixArray, self._backingArray, self._suffixArray);
        }

      } else if (index < self._prefixArray.length + self._backingArray.length) {

        return new Vector(
          updateArray(self._backingArray, function (arr) {
            arr.splice(index - self._prefixArray.length, 0, value);
            return arr;
          }),
          self._suffixArray,
          self._prefixArray
        );

      } else {

        var newSuffixArray = updateArray(self._suffixArray, function (arr) {
          var suffixIndex = index - (self._prefixArray.length + self._backingArray.length);
          if (suffixIndex < arr.length) {
            arr.splice(suffixIndex, 0, value);
          } else {
            arr[suffixIndex] = value;
          }
          return arr;
        });

        if (newSuffixArray.length <= SUFFIX_SIZE) {
          return new Vector(self._backingArray, self._prefixArray, newSuffixArray);
        } else {
          return fromArrays(self._prefixArray, self._backingArray, newSuffixArray);
        }

      }
    },

    /** Prepend value to the beginning of the vector.
     * @param {*} value value
     * @return {Vector} new vector instance, original is unaffected */
    prepend: function (value) {
      if (this.isEmpty()) {
        return new Vector([value]);
      } else {
        if (this._prefixArray.length < PREFIX_SIZE) {
          return new Vector(
            this._backingArray,
            updateArray(this._prefixArray, function (arr) {
              arr.unshift(value);
              return arr;
            }),
            this._suffixArray
          );
        } else {
          return fromArrays([value], this._prefixArray, this._backingArray, this._suffixArray);
        }
      }
    },

    /** Append value to the end of the vector.
     * @param {*} value value
     * @return {Vector} new vector instance, original is unaffected */
    append: function (value) {
      if (this.isEmpty()) {
        return new Vector([value]);
      } else {
        if (this._suffixArray.length < SUFFIX_SIZE) {
          return new Vector(
            this._backingArray,
            this._prefixArray,
            updateArray(this._suffixArray, function (arr) {
              arr.push(value);
              return arr;
            })
          );
        } else {
          return fromArrays(this._prefixArray, this._backingArray, this._suffixArray, [value]);
        }
      }
    },

    /** Fill vector from JavaScript array. Effectively concatenates this vector with the array supplied.
     * @param {Array} arr JavaScript array
     * @param {Function} [f] function applied to each value
     * @return {Vector} new vector instance, original is unaffected */
    fillFromArray: function (arr, f) {
      var effectiveArr = f ? arr.map(f) : arr;
      return this.fill.apply(this, effectiveArr);
    },

    /** Convert to JavaScript array.
     * @param {Function} [f] function applied to each value
     * @return {Array} JavaScript array containing same values in same order as this vector */
    toArray: function (f) {
      var map = function (arr) { return f ? arr.map(f) : arr; };
      return [].concat.apply([], [map(this._prefixArray), map(this._backingArray), map(this._suffixArray)]);
    }

  });

  Util.subclass(Vector, Associative);

  /** Vector iterator constructor.
   * @param {Vector} vector vector
   * @public
   * @class VectorIter
   * @augments Iter
   * @classdesc Vector iterator. */
  var VectorIter = function (vector) {
    /** @private */
    this._currentArray = vector._prefixArray;
    /** @private */
    this._nextArrays = [vector._backingArray, vector._suffixArray];
    /** @private */
    this._nextIndex = 0;
  };

  VectorIter.prototype = Object.freeze( /** @lends VectorIter.prototype */ {

    /** Check if iterator has more elements.
     * @return {Boolean} */
    hasNext: function () {
      return this._nextIndex < this._currentArray.length || !!Util.find(this._nextArrays, function (arr) {
        return arr.length > 0;
      });
    },

    /** Get next element and advance iterator one step forward.
     * @return {*} */
    next: function () {
      if (this._nextIndex < this._currentArray.length) {
        return this._currentArray[this._nextIndex++];
      } else if (this._nextArrays.length > 0) {
        this._nextIndex = 0;
        this._currentArray = this._nextArrays[0];
        this._nextArrays.splice(0, 1);
        return this.next();
      } else {
        return null;
      }
    }

  });

  Util.subclass(VectorIter, Associative.prototype.Iter);

  return new Vector([]);

});