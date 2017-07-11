/**
 * Makes an associative array based on the keys and values provided
 * @param {array} keys - Array of keys for output array
 * @param {array} values - Array of values for output array
 */
function zip_arrays(keys, values) {
  var returnValues = {};
  values.forEach(function(val, i) {
    returnValues[keys[i]] = val;
  });
  return returnValues
}

/**
 * Retrieves HTTP GET parameters from url, returns them in an associative array
 */
function get_url_params() {
  var $_GET = {};

  document.location.search.replace(/\??(?:([^=]+)=([^&]*)&?)/g, function () {
      function decode(s) {
          return decodeURIComponent(s.split("+").join(" "));
      }

      $_GET[decode(arguments[1])] = decode(arguments[2]);
  });
  return $_GET;
}

function timeParse(timestring) {
  var ampm_match = timestring.match(/(.*)[AP]M$/);
  if (ampm_match) {
    var pm_match = timestring.match(/(.*)pm\s*$/i);
    if (pm_match) {
      var timeArray = pm_match[1].split(':');
      var hour = parseInt(timeArray[0])+12;
      var minute = parseInt(timeArray[1]);
      if (hour == 24) {
        hour = 12;
      }
      var theTime = [hour,minute];
      return theTime
    } else {
      var timeArray = ampm_match[1].split(':');
      var hour = parseInt(timeArray[0]);
      var minute = parseInt(timeArray[1]);
      if (hour == 12) {
        hour = 24;
      }
      var theTime = [hour,minute];
      return theTime
    }
  } else {
    var timeArray = timestring.split(':');
    var hour = parseInt(timeArray[0]);
    var minute = parseInt(timeArray[1]);
    return [hour,minute]
  }
}

/**
 * Takes an ID string for a div, and removes leading #, if any
 * @param {string} id_string - string to be modified
 */
function plainId(id_string) {
  if (id_string.startsWith('#')) {
    return id_string.slice(1);
  } else {
    return id_string;
  }
}

/**
 *
 */
function GetDisplayDate(row,startDate,endDate) {
  if (startDate == null) {
    return null;
  }
  var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  displayDate = "";
  if (row['Month'] && row['Month'] != "") { displayDate += months[startDate.getMonth()]+" "; }
  if (row['Day']   && row['Day'] != "")   { displayDate += startDate.getDate()+", "; }
  if (row['Year']  && row['Year'] != "")  { displayDate += startDate.getFullYear(); }
  if (row['Time']  && row['Time'] != "")  { displayDate += " at " + startDate.getHours() + ":" + startDate.getMinutes(); }
  if (endDate) {
    displayDate += " - ";
    if (row['End Month'] && row['End Month'] != "") { displayDate += months[endDate.getMonth()]+" "; }
    if (row['End Day']   && row['End Day'] != "")   { displayDate += endDate.getDate()+", "; }
    if (row['End Year']  && row['End Year'] != "")  { displayDate += endDate.getFullYear(); }
    if (row['End Time']  && row['End Time'] != "")  { displayDate += " at " + endDate.getHours() + ":" + endDate.getMinutes(); }
  }
  return displayDate;
}

function testFilter(self) {
  if (self.filters.tagOptions == "all") {
    return function(item) {
      console.log("filter run because all");
      return true;
    }
  } else {
    return function(item) {
      console.log("filter run because any");
      return true;
    }
  }
}

/**
 *
 */
function GetDisplayTitle(row,displayDate) {
  var output = "<div class=\"ft-item-tooltip\"><h1>"+row['Headline']+"</h1>";
  output += "<p>"+displayDate+"</p></div>"
  return output;
}

/**
 * Class loading data from one or more Google Sheets formatted for use in Knight
 * Lab's Timeline JS. Prepares data for use in visjs timeline. Uses jquery.
 * Data is loaded asynchronously, so should be loaded in FabulousTime.promise.done()
 * function. Start and end dates are loaded, other properties are stored as item
 * properties to be loaded by templates or as part of the item dataset object.
 */
class FabulousTime {
  /**
   * Load data from Google Sheets by sheet IDs
   * @param {array} sheet_ids - Array with Google Sheet ids as strings. If
   * sheet_ids is a string, it is assumed to be a single sheet ID
   * @param {string} api_key - Google Sheets API key.
   * @param {array} options - options for setting up timeline display
   */
  constructor(api_key, sheet_ids=null, options={}) {
    // Set up initial static stuff
    this.api_key = api_key;
    this.options = this.set_options(options);

    this.sheet_data = [];

    this.filters = {
      "activeGroups": [],
      "activeTags": [],
      "tagOptions": "any",
    };

    this.itemDataTemplate = Handlebars.compile('\
      <div class="ft-close-button ft-vcenter-outer">\
        <div class="ft-vcenter-middle">\
          <span class="ft-vcenter-inner">X</span>\
        </div>\
      </div>\
      <div id="ft-item-text">\
        <div class="ft-vcenter-outer ft-cols-1">\
          <div class="ft-vcenter-middle">\
            <div class="ft-vcenter-inner">\
              <h1>{{headline}}</h1>\
              <p class="ft-display-date">{{display_date}}</p>\
              <p>{{{text}}}</p>\
            </div>\
          </div>\
        </div>\
      </div>');

    this.tag_col = this.get_tag_col();

    // Create a context-agnostic way to refer back to this parent object
    var self = this;

    // Set up page skeleton for the addition of content
    this.setup_dom(self, options);

    $(window).resize(function() {
      self.timeline.options.height = window.innerHeight;
      self.timeline.redraw();
      var windowHeight = window.innerHeight;
      var bylineHeight = $(".tl-caption").height() + $(".tl-credit").height() || 0;
      // var creditHeight =
      $("#ft-dynamic-style").html(`
        #ft-item-data {
          height: ${0.7 * windowHeight}px;
          top: ${0.15 * windowHeight}px;
        }
        .tl-media-image {
          max-height: ${0.7 * windowHeight - bylineHeight - 70}px !important;
        }
      `);
    });

    // Set up vis.js timeline object
    this.timeline = this.create_timeline(options);

    // Get the IDs of Google sheets to draw data from.
    // Returns a promise, so subsequent functions have to make sure it's done.
    this.getting_sheet_ids = this.get_sheet_ids(self,sheet_ids);

    // When sheet IDs have been retrieved, get the data from relevant sheets.
    this.getting_sheet_data = this.getting_sheet_ids.then(function() {
      return self.get_all_sheet_data();
    });

    // Run data setup functions once data has been retrieved
    self.ready = self.getting_sheet_data.then(function() {
      self.items = self.set_items(self, self.sheet_data);
      self.groups = self.set_groups(self);
      self.tags = self.set_tags(self);
    });

    // When data has been retrieved and massaged into shape, render the visualization.
    self.ready.done(function() {
      $("#ft-item-data").empty();
      if (self.title_entry) {
        self.RenderItem(self,self.title_entry,self.itemDataTemplate);
      }
      var dataset = new vis.DataSet(self.items);
      var view = new vis.DataView(dataset, {
        // filter: self.item_filter(self),
        filter: self.item_filter(self),
      });
      self.view = view;
      self.timeline.setItems(view);
      var dataRange = self.timeline.getDataRange();
      var padding = 0.01 * (dataRange.max - dataRange.min);
      var timelineMin = new Date(dataRange.min.getTime() - padding);
      var timelineMax = new Date(dataRange.max.getTime() + padding);
      self.options.timelineOptions.min = timelineMin;
      self.options.timelineOptions.max = timelineMax;
      self.timeline.setOptions(self.options.timelineOptions);
      self.timeline.on('select', function(properties) {
        var selected_item = dataset._getItem(properties.items[0]);
        if (selected_item) {
          self.RenderItem(self, selected_item, self.itemDataTemplate);
        } else {
          self.HideItemDetails();
        }
      });
      $("#ft-loading").addClass("ft-inactive");
    })
  }

  /**
   * Sets up options using initial default set of options, which is extended by user input
   * @param {array} supplied_options - The user-defined options to overwrite defaults
   */
  set_options(supplied_options) {
    var defaults = {
      timelineOptions: {
        height: window.innerHeight,
        dataAttributes: ['text','media'],
        margin: {
          item: 5,
          axis: 10,
        },
        tooltip: {
          followMouse: true,
        },
        template: Handlebars.compile(""),
        // order: function(a, b) { return (a.end - a.start) < (b.end - b.start); },
        order: function(a, b) { return a.group_slug < b.group_slug; },
      }
    }
    $.extend(defaults,supplied_options);
    return defaults;
  }

  get_tag_col() {
    var url_params = get_url_params();
    if ('tag_col' in url_params) {
      return url_params['tag_col'];
    } else {
      return 'Tags';
    }
  }

  /**
   * Set up the DOM within the timeline div for use by the rest of the functions
   * @param {array} options - A dictionary-like array of options to use in DOM creation
   */
  setup_dom(self, options) {
    if ("divId" in options) {
      var div_id = plainId(options['divId']);
    } else {
      var div_id = "timeline";
    }
    var container = $("#"+div_id);
    var windowHeight = window.innerHeight;
    var bylineHeight = $(".tl-caption").height() + $(".tl-credit").height() || 0;
    container.append(`<div id="ft-loading" class="ft-vcenter-outer"><div class="ft-vcenter-middle"><div class="ft-vcenter-inner"><p>Loading...</p></div></div></div>`);
    container.append(`<div id="ft-filters"></div>`);
    container.append(`<div id="ft-item-data" class="ft-data-inactive"><span class="ft-close">X</span></div>`);
    container.append(`<div id="ft-visualization"></div>`);
    container.append(`<style id="ft-dynamic-style">
        #ft-item-data { height: ${0.7 * windowHeight}px; top: ${0.15 * windowHeight}px; }
        .tl-media-image { max-height: ${0.7 * windowHeight - bylineHeight - 70}px !important; }
      </style>`);
    return true;
  }

  /**
   *
   */
  create_timeline(options) {
    var container = document.getElementById('ft-visualization');
    var timeline = new vis.Timeline(container,options.timelineOptions);
    return timeline;
  }

  /**
   * Render the given item according to the given template, adding to elements
   * identified by selectors
   * @param {array} item - Array representing a timeline item
   * @param {Handlebars.compile} template - Handlebars templating function to apply to item
   */
  RenderItem(self,item,template) {
    var data_id = "ft-item-data";
    var text_id = "ft-item-text";
    var media_id = "ft-item-media";
    $("#"+data_id).empty();
    var contents = template(item);
    $("#"+data_id).append(contents);
    var item_media_dict = item['media'];
    if (item_media_dict['url'] && item_media_dict['url']!="") {
      $("#"+data_id).append(
        `<div id="ft-item-media-container" class="ft-cols-2">\
          <div class="ft-vcenter-outer">\
            <div class="ft-vcenter-middle">\
              <div id="${media_id}" class="ft-vcenter-inner"></div>\
            </div>\
          </div>\
        </div>`
      );
      $("#"+text_id).attr('class','ft-cols-2');
      $("#"+data_id).attr('class','ft-data-active');
      var item_media_type = TL.MediaType(item_media_dict);
      var item_media = new item_media_type.cls(item_media_dict);
      item_media.addTo(document.getElementById(media_id));
      item_media.loadMedia();
      item_media.options['width'] = $("#ft-item-media-container").width() - 10;
      window.item_media = item_media;
      $(".tl-caption").attr('style',"");
      $(window).on("resize", function() {
        var target_width = $("#ft-item-media-container").width() - 10;
        item_media._el.content_item.style.height = TL.Util.ratio.r16_9({w:target_width}) + "px";
        item_media._el.content_item.style.width = target_width + "px";
      });
    } else {
      $("#"+text_id).attr('class','ft-cols-1');
      $("#"+data_id).attr('class','ft-data-active');
    }
    $(".ft-close-button").on('click',{item: item, self: self},self.HideItemDetails);
    return null;
  }

  HideItemDetails(event) {
    $("#ft-item-data").attr('class','ft-data-inactive');
    if (event) {
      event.data.self.timeline.setSelection();
    }
  }

  /**
   * Get sheet ids from parameters, or from HTTP GET pointing to spreadsheets
   * @param {scope} self - The scope on which this function will be applied.
   * @param {array|string} - IDs for Google Spreadsheets given as parameters. If
   * none are given, the function will look to a url parameter, tl_list, for the
   * id of a master spreadsheet, and pull sheet urls from there.
   */
  get_sheet_ids(self,sheet_ids=null) {
    var dfd = $.Deferred();
    if (typeof(sheet_ids)=='string') {
      self.sheet_ids = [sheet_ids];
      dfd.resolve();
    } else if (typeof(sheet_ids)=='array') {
      self.sheet_ids = sheet_ids;
      dfd.resolve();
    } else {
      var pattern = /([a-zA-Z0-9_-]{44})/g
      var master_id_sheet = get_url_params()['tl_list'];
      var single_sheet_id = get_url_params()['tl_sheet'];
      if (master_id_sheet != null) {
        var sheet_ids = [];
        $.getJSON("https://sheets.googleapis.com/v4/spreadsheets/"+master_id_sheet+"/values/A:A?key="+self.api_key).done(function(data) {
          for (var i = 0; i < data.values.length; i++) {
            var url = data.values[i][0];
            var the_id = url.match(pattern)[0];
            sheet_ids.push(the_id);
          }
          self.sheet_ids = sheet_ids;
          dfd.resolve();
        });
      } else if (single_sheet_id != null) {
        self.sheet_ids = [single_sheet_id];
        dfd.resolve();
      } else {
        $( function() {
          var baseurl = window.location.origin + window.location.pathname;
          var tl_setup = $('#timeline-setup');
          function redirect_multi() {
            var list_sheet_id = $('#multi-sheet-url').val().match(pattern);
            var page_height = $('#page-height').val();
            var tag_col = $('#tag-column').val();
            var url = `${baseurl}?tl_list=${list_sheet_id}&height=${page_height}`;
            if (tag_col != '') {
              url += `&tag_col=${tag_col}`;
            }
            window.location.replace(url);
          }
          function redirect_single() {
            var single_sheet_id = $('#single-sheet-url').val().match(pattern);
            var page_height = $('#page-height').val();
            var tag_col = $('#tag-column').val();
            var url = `${baseurl}?tl_sheet=${single_sheet_id}&height=${page_height}`;
            if (tag_col != '') {
              url += `&tag_col=${tag_col}`;
            }
            window.location.replace(url);
          }
          var tl_single_entry = $('#timeline-single-entry').dialog({
            autoOpen: false,
            height: 300,
            width: 400,
            modal: true,
            buttons: {
              "Create Timeline": redirect_single
            }
          });
          var tl_multi_entry = $('#timeline-multi-entry').dialog({
            autoOpen: false,
            height: 300,
            width: 400,
            modal: true,
            buttons: {
              "Create Timeline": redirect_multi
            }
          });
          tl_setup.dialog({
            resizable: false,
            height: "auto",
            width: 400,
            modal: true,
            buttons: {
              "Single Timeline Sheet": function() {
                $(this).dialog("close");
                tl_single_entry.dialog('open');
              },
              "Multiple Timeline Sheets": function() {
                $(this).dialog("close");
                tl_multi_entry.dialog('open');
              }
            }
          });
          tl_multi_entry.find("form").on("submit", function(event) {
            event.preventDefault();
            redirect_multi();
          });
          tl_single_entry.find("form").on("submit", function(event) {
            event.preventDefault();
            redirect_single();
          });
        });
      }
    }
    return dfd.promise();
  }

  /**
   * Gets data from the spreadsheet with the given ID
   * Returns an array of rows as associative arrays keyed by column name
   * @param {string} sheet_id - ID of Google spreadsheet containing data
   */
  get_sheet_data(sheet_id) {
    var self = this;
    var dfd = $.Deferred();
    $.getJSON("https://sheets.googleapis.com/v4/spreadsheets/"+sheet_id+"/values/A:ZZZ?key="+this.api_key).done(function(data) {
      var columns = data.values[0];
      for (var i = 1; i < data.values.length; i++) {
        var values = zip_arrays(columns, data.values[i]);
        self.sheet_data.push(values);
      };
      dfd.resolve();
    });
    return dfd.promise();
  };

  /**
   * Gets data from multiple spreadsheets, returns it all in the same array.
   * Built for data where there is consistency in column naming
   * Resulting array will contain associative arrays keyed by their sheet's
   * column names, so having column names that differ may break the use of
   * output.
   * @param {array} sheet_ids - Array of sheet IDs from which data is to be extracted
   * @uses get_sheet_data
   */
  get_all_sheet_data() {
    var self = this;
    var promises = [];
    for (var i = 0; i < this.sheet_ids.length; i++) {
      var sheet_id = this.sheet_ids[i];
      promises.push(this.get_sheet_data(sheet_id));
    };
    return $.when.apply($,promises);
  };

  /**
   * Constructs a date, given year, month, day, or time may be null.
   * Returns a date object or null, if all inputs are null.
   * @param {integer} year  - year for date constructor
   * @param {integer} month - month for date constructor
   * @param {integer} day   - day for date constructor
   * @param {integer} time  - time for date constructor
   */
  dateWithNulls(year,month,day,time){
    var date = new Date([1,'01','01','00:00'])
    if (year  && year.trim())  { date.setYear(year); }
    if (month) { date.setMonth(month); }
    if (day   && day.trim())   { date.setDate(day); }
    if (time  && time.trim())  { date.setHours(timeParse(time)[0]); date.setMinutes(timeParse(time)[1]); }
    if (date.getTime() != new Date([1,'01','01','00:00']).getTime()) {
      // If the date has changed from the initial value, return it
      return date;
    } else {
      // Otherwise return null
      return null;
    }
  }

  /**
   * Gets date/time information from datum by column names.
   * @uses dateWithNulls
   * @param {array} datum - Associative array of row as generated by get_sheet_data
   * @param {string} year_column  - Key for year data in datum
   * @param {string} month_column - Key for month data in datum
   * @param {string} day_column   - Key for day data in datum
   * @param {string} time_column  - Key for time data in datum
   * @param {function} callback - Function to construct the datetime object
   */
  get_datetime(datum,year_column,month_column,day_column,time_column,callback) {
    var year  = datum[year_column];
    var month = parseInt(datum[month_column])-1;
    var day   = datum[day_column];
    var time  = datum[time_column];
    var output = callback(year,month,day,time);
    return output;
  };

  /**
   * Used to set the `items` property of the class.
   * @param {object} self - The "this" to which the items should be set.
   * @param {array} sheet_data - Array of data from sheets to be made into items.
   */
  set_items(self, sheet_data) {
    var items = [];
    for (var i = 0; i < sheet_data.length; i++) {
      var item = {};
      item['start'] = self.get_datetime(sheet_data[i],'Year','Month','Day','Time',self.dateWithNulls);
      item['end']   = self.get_datetime(sheet_data[i],'End Year','End Month','End Day','End Time',self.dateWithNulls);
      item['headline']        = sheet_data[i]['Headline'];
      item['text']            = sheet_data[i]['Text'];
      item['media']           = {};
      item['media']['url']       = sheet_data[i]['Media'];
      item['media']['credit']    = sheet_data[i]['Media Credit'];
      item['media']['caption']   = sheet_data[i]['Media Caption'];
      item['media']['thumbnail'] = sheet_data[i]['Media Thumbnail'];
      item['sheet_type']      = sheet_data[i]['Type'];
      item['sheet_group']     = sheet_data[i]['Group'];
      item['group_slug']      = self.slugify(sheet_data[i]['Group']);
      if (item['end'] && item['start'] && item['end']-item['start']<=0) {
        // If there is both a start date and an end date, but they are equal,
        // or less than zero (end before start),
        // set the end date to null to make it display as a point.
        item['end'] = null;
      }
      if (sheet_data[i]['Display Date'] && sheet_data[i]['Display Date'] != "") {
        item['display_date'] = sheet_data[i]['Display Date'];
      } else {
        item['display_date'] = GetDisplayDate(sheet_data[i],item['start'],item['end']);
      }
      item['title'] = GetDisplayTitle(sheet_data[i],item['display_date'])
      if (self.tag_col in sheet_data[i]) {
        var tags = sheet_data[i][self.tag_col].split(',').map(function(x) {
          return x.trim();
        });
        item['tags'] = tags;
        item['tag_slugs'] = tags.map(function(x) { return self.slugify(x); });
      }
      if (item['start']) {
        items.push(item);
      } else if (item['sheet_type']=="title") {
        self.title_entry = item;
      }
    }
    return items;
  }

  /**
   * Uses groups from Timeline JS to color the timeline.
   */
  set_groups(self) {
    var groups = [];
    for (var i = 0; i < self.items.length; i++) {
      if (self.items[i]['sheet_group']) {
        var group = self.items[i]['sheet_group'];
        var slug = self.slugify(group);
        if ($.inArray(group,groups) == -1) {
          groups.push(group);
        }
        self.items[i]['className'] = slug;
      } else {
        self.items[i]['className'] = "Ungrouped"
        if ($.inArray('Ungrouped',groups) == -1) {
          groups.push("Ungrouped");
        }
      }
    }
    groups.sort();
    self.setup_group_ui(self, groups);
    return groups;
  }

  /**
   * Sets up color scheme and filters for groups.
   */
  setup_group_ui(self, groups) {
    self.setup_filters(self,groups,"Groups");
    var scheme = palette.listSchemes('rainbow')[0];
    var colors = scheme.apply(scheme, [groups.length, 0.4]);
    var theStyle = $("#docstyle");
    for (var i = 0; i < groups.length; i++) {
      var slug = self.slugify(groups[i]);
      var style = `.${slug}.vis-item,\
      #ft-filters .${slug}.filter {\
        background-color: #${colors[i]};\
        border-color: #${colors[i]};\
      }\n`;
      theStyle.append(style);
    }
  }

  /**
   * Sets up tags to be used as filters
   */
  set_tags(self) {
     var tags = [];
     for (var i = 0; i < self.items.length; i++) {
       if (self.items[i]['tags']) {
         var these_tags = self.items[i]['tags'];
         var slugs = these_tags.map(self.slugify);
         tags = tags.concat(these_tags);
         if (self.items[i]['className']) {
           self.items[i]['className'] = self.items[i]['className'] + ' ' + slugs.join(' ');
         } else {
           self.items[i]['className'] = slugs.join(' ');
         }
       }
     }
     tags = tags.filter( self.onlyUnique );
     tags.sort();
     self.setup_filters(self,tags,"Tags");
     return tags;
  }

  /**
   *
   */
  setup_filters(self, filter_names, filter_class) {
    if (filter_names.length > 0) {
      var html = `<div class="${filter_class} filter-group">`;
      html += `<h1>${filter_class} Filters</h1>`
      for (var i = 0; i < filter_names.length; i++) {
        var name = filter_names[i];
        if (name == "") {
          name = `[No ${filter_class}]`;
        }
        var slug = self.slugify(name);
        var HTMLtemplate = `<div class="filter ${slug} ${filter_class}"><label for="${slug}">${name}</label>\
        <input id="${slug}" type="checkbox" class="filter-checkbox" value="${slug}"></div>`;
        // var CSSTemplate = `<style id="${slug}-style">.vis-item.${slug}{display:inline-block !important;}</style>`
        html += HTMLtemplate;
        // $("head").append(CSSTemplate);
      }
      // var clear_name = "All " + filter_class;
      // var clear_slug = self.slugify(clear_name);
      // var template = `<div class="meta-filter ${clear_slug} ${filter_class}"><label for="${clear_slug}">${clear_name}</label>\
      // <input id="${clear_slug}" type="checkbox" class="tagFilter" value="${clear_slug}" checked></input></div>`;
      // html += template;
      // html += "</div>";
      if (filter_class == "Tags") {
        html += '<div id="tag-options">\
          <input type="radio" name="tag-options" id="tag-option-any" checked>\
          <label for="tag-option-any">OR</label>\
          <input type="radio" name="tag-options" id="tag-option-all">\
          <label for="tag-option-all">AND</label></div>';
      }
      html += `<div class="${filter_class} clear-filters">Clear all filters</div>`;
      html += '</div>';
      $("#ft-filters").append(html);
      $(`.${filter_class}.filter input`).on('click',{self:self},self.filter_items);
      $("#tag-options input").on('click',{self:self},self.filter_items);
      $(`.${filter_class}.clear-filters`).on('click', {self:self}, function() {
        $(".filter input").prop('checked',false);
        self.set_filters('none',self);
        self.apply_filters(self);
      })
      // $(`.${clear_slug} input`).on('click',function() {
        // Clear all group filters
        // var is_checked = $(this).prop('checked');
        // var selector = `.filter.${filter_class} input`;
        // $(selector).each(function() {
        //   if ($(this).prop('checked')!=is_checked) {
        //     $(this).click();
        //   }
        // });
        // .prop('checked',$(this).prop('checked'));
        // self.filter_items();
      // });
    }
  }

  /**
   * This function runs as an on click event on filter checkboxes. It changes
   * the style blocks that determine how timeline items are displayed, then
   * redraws the timeline based on the new display settings.
   * @param {event} event - The event that triggers the function. This should
   * have a self parameter identified, which should have the timeline object to
   * be redrawn.
   */
  filter_items(event) {
    var slug = $(this).attr('id');
    event.data.self.set_filters(slug, event.data.self);
    event.data.self.view.refresh();
    // event.data.self.apply_filters(event.data.self);
    // var style_block = $(`#${slug}-style`);
    // style_block.empty();
    // if ($(this).prop('checked')) {
    //   style_block.append(`.vis-item.${slug}{display:inline-block !important;}`)
    // } else {
    //   style_block.append(`.vis-item.${slug}{display:none;}`);
    // }
    // event.data.self.timeline.redraw();
  }

  /*
   *
   */
  set_filters(slug, self) {
    // Set Group filters
    var activeGroups = [];
    var groupCheckboxes = $(".Groups input.filter-checkbox");
    for (var i = 0; i < groupCheckboxes.length; i++) {
      if (groupCheckboxes[i].checked) {
        activeGroups.push(groupCheckboxes[i].value);
      }
    }
    self.filters.activeGroups = activeGroups;
    // Set Tag filters
    var activeTags = [];
    var tagCheckboxes = $(".Tags input.filter-checkbox");
    for (var i = 0; i < tagCheckboxes.length; i++) {
      if (tagCheckboxes[i].checked) {
        activeTags.push(tagCheckboxes[i].value);
      }
    }
    self.filters.activeTags = activeTags;
    if ($("#tag-options").length > 0) {
      if ($("#tag-option-any")[0].checked) {
        self.filters.tagOptions = "any";
      } else if ($("#tag-option-all")[0].checked) {
        self.filters.tagOptions = "all";
      } else {
        self.filters.tagOptions = "any";
        $("#tag-option-any")[0].checked = true;
        console.log("Tag options div exists, but radio input is unset. That's weird.");
      }
    }
  }

  /**
   * Function to be applied directly to the data view that backs the timeline
   */
  item_filter(self) {
    return function(item) {
      if (self.filters.activeGroups.length == 0 && self.filters.activeTags.length == 0) {
        // If neither group nor tag filters are set, return a filter function that
        // always returns true.
        return true;
      } else if (self.filters.activeGroups.length > 0 && self.filters.activeTags.length == 0) {
        // If only the group filter is set, return a function to check if the
        // group of an item is active
        return $.inArray(item.group_slug,self.filters.activeGroups) > -1;
      } else if (self.filters.activeGroups.length == 0 && self.filters.activeTags.length > 0) {
        // If only the tag filter is set...
        if (self.filters.tagOptions == "all") {
          // ...and tag options are set to match all tags, return a function to
          // filter to only items with all of the active tags applied.
          return self.filters.activeTags.every(function(element, index, array) {
            return $.inArray(element,item.tag_slugs) > -1;
          });
        } else {
          // ...and tag options are set to match any active tag, return a function
          // to filter to only items with any active tag applied.
          return self.filters.activeTags.some(function(element, index, array) {
            return $.inArray(element,item.tag_slugs) > -1;
          });
        };
      } else {
        // Both tag filters and group filters are set. Items should be filtered to
        // only those with an active group and any/all active tags, depending on
        // active tag behavior.
        var hasActiveGroup = $.inArray(item.group_slug,self.filters.activeGroups) > -1;
        if (hasActiveGroup) {
          // If the group is active, do the tag checks.
          if (self.filters.tagOptions == "all") {
            // Check if all tags are active
            var hasAllTags = self.filters.activeTags.every(function(element, index, array) {
              return $.inArray(element,item.tag_slugs) > -1;
            });
            return hasAllTags;
          } else {
            // Check if any tags are active
            var hasAnyTag = self.filters.activeTags.some(function(element, index, array) {
              return $.inArray(element,item.tag_slugs) > -1;
            });
            return hasAnyTag;
          }
        } else {
          // If the group is not active, don't bother with the tag checks, just
          // return false
          return false;
        }
      }
    }
  }

  apply_filters(self) {
    // add/remove items according to current filters
    if (self.filters.activeGroups.length == 0 && self.filters.activeTags.length == 0) {
      // No group or tag filters
      self.timeline.itemsData.clear();
      self.timeline.itemsData.add(self.items);
      return 0;
    } else if(self.filters.activeGroups.length > 0 && self.filters.activeTags.length == 0) {
      // Only active Groups are set as filters
      self.timeline.itemsData.clear();
      self.timeline.itemsData.add(self.items.filter(function(item) {
        return $.inArray(item.group_slug,self.filters.activeGroups) != -1;
      }));
    } else if (self.filters.activeGroups.length == 0 && self.filters.activeTags.length > 0) {
      // Only active Tags are set as filters
      self.timeline.itemsData.clear();
      if (self.filters.tagOptions == "all") {
        self.timeline.itemsData.add(self.items.filter(function(item) {
          return self.filters.activeTags.every(function(element, index, array) {
            return $.inArray(element,item.tag_slugs) != -1;
          });
        }));
      } else {
        self.timeline.itemsData.add(self.items.filter(function(item) {
          return self.filters.activeTags.some(function(element, index, array) {
            return $.inArray(element,item.tag_slugs) != -1;
          });
        }));
      }
    }
  }

  /**
   * Takes a text string, prepares it to be used as an identifying slug
   * Returns slugified string
   * @param {string} text - the text to be made into a slug.
   */
  slugify(text) {
    if (typeof(text) == "string") {
      var output = text.trim()
      var pattern = /[\s~!@$%^&*()+=,./';:"?><[\] \\{}|`#]+/g
      output = output.replace(pattern,'_')
      return output
    } else {
      return "";
    }
  }

  /**
   * Used as a filter for an array, this function returns only the unique values
   * of that array.
   */
  onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
  }
}
