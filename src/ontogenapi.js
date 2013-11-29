import "util.js"
import "test.js"

/*
 * Config, URLs, Default Options, etc
 */
var docsJoinName = "docs";
var docsFieldName = "text";

  var ontoPrefix = "onto_"; // ontology storeName prefix
var ontoRegex = /^onto_/; // ontology storeName prefix regex
var baseUrl = "/ontogenapi/";
var DEFAULT_STOPWORDS = "none";
var DEFAULT_STEMMER = "none";
var DEFAULT_SUGGESTIONS = 2;
var DEFAULT_ITER = 50;
var DEFAULT_NUM_KEYWORDS = 10;

// @TODO replace this with an automatic function
var url_for = function(what, which, where) {
  var url = baseUrl;
  switch(what) {
    case "ontologies":
      url += "ontologies/";
      if(typeof which != 'undefined') {
        url += which + "/";
      }
      break;
    case "stores":
      url += "stores/";
      if(typeof which != 'undefined') {
        url += which + "/";
      }
      break;

    case "concepts":
      url += "ontologies/" + where + "/concepts/";
      if(typeof which !== 'undefined' && which !== null) {
        url += which + "/";
      }
      break;
  }
  return url;

};

var ontologyNameFromStoreName = function(storeName) {
  return storeName.replace(ontoRegex, "");
};

function RootConcept(docStore, swords, stmr) {
  var stopwords = swords || DEFAULT_STOPWORDS;
  var stemmer = stmr || DEFAULT_STEMMER;

  var concept = {
    name: "root",
    keywords: "",
    stopwords: stopwords,
    stemmer: stemmer,
    parentId: -1,
  };
  var docs = [];
  for(var ii = 0; ii < docStore.length; ii++) {
    docs.push({$record: docStore[ii].$id});
  }
  concept[docsJoinName] = docs;
  return concept;
}
 
// Language Options
http.onRequest("languageoptions", "GET", function(req, res) {
  console.say("OntoGen API - Language Options");
  
  res.send(ontogen.getLanguageOptions());
});

/*
 * Stores
 */
// Get List of Stores
http.onRequest("stores", "GET", function(req, res) {
  console.say("OntoGen API - GET Stores");
  var dataStores = qm.getStoreList().filter(function(store) {
    return store.storeName.indexOf(ontoPrefix) !== 0;
  });
  // build ontology objects
  var rdata = dataStores.map(function(store) {
    store.links = {};
    store.links.self = url_for("stores", store.storeName);
    return store;
  });
  res.send(rdata);
});

// Get Store info @TODO

/*
 * Ontologies
 */
// Get List of Existing Ontologies
http.onRequest("ontologies", "GET", function(req, res) {
  console.say("OntoGen API - GET Existing Ontologies");
  var ontologies = qm.getStoreList().filter(function(store) {
    return store.storeName.indexOf(ontoPrefix) === 0;
  });
  // build ontology objects
  var rdata = ontologies.map(function(onto) {
    onto.links = {};
    onto.links.self = url_for("ontologies", onto.storeName);
    onto.links.concepts = url_for("concepts", null, onto.storeName);
    onto.name = ontologyNameFromStoreName(onto.storeName);
    return onto;
  });
  res.send(rdata);
});

/// Create - New Ontology
// - Body should countain {ontologyName: "", dataStore: "", dataField: ""}
http.onRequest("ontologies", "POST", function(req, res) {
  console.say("OntoGen API - Create Ontologies: " + JSON.stringify(req));

  if(!req.hasOwnProperty("jsonData")) {
    res.setStatusCode(400);
    res.send("Missing data.");
    return;
  }
  var data = req.jsonData;
  if(!data.hasOwnProperty("ontologyName") || !data.hasOwnProperty("dataStore")) {
    res.setStatusCode(400);
    res.send("Missing ontology name and/or dataStore properties.");
    return;
  }
  
  var dataStoreName = req.jsonData.dataStore;
  var dataStore = qm.store(dataStoreName);
  if(dataStore === null) {
    res.setStatusCode(400);
    res.send("Data Store '" + dataStoreName + "' not found");
    return;
  }
  var ontologyName = req.jsonData.ontologyName;
  // verify if storeName starts with prefix if not, add prefix
  if(ontologyName.indexOf(ontoPrefix) !== 0) {
    ontologyName = ontoPrefix + ontologyName; // add prefix
  }
  // check if ontology already exists
  if(qm.store(ontologyName) !== null) {
    res.setStatusCode(409);
    res.send("An ontology with the specified name already exists");
    return;
  }

  var storeDef = [{
    "name": ontologyName,
    "fields":  [
      { "name": "name", "type": "string", "primary":false},
      { "name": "keywords", "type": "string", "primary":false},
      { "name": "stopwords", "type": "string", "primary":false},
      { "name": "stemmer", "type": "string", "primary":false}
    ],
    "keys": [
      {"field": "name", "type": "value"}
    ],
    "joins": [
      {"name" : docsJoinName, "type" : "index",  "store" : dataStoreName},
      {"name": "parent", "type": "field", "inverse": "childOf", "store": ontologyName},
      {"name": "childOf", "type": "index", "store": ontologyName, "inverse" : "parent" }
    ]
  }];

  // create ontology
  qm.createStore(storeDef);
  // Successful?
  var s = qm.store(ontologyName);
  if(s === null) {
    res.setStatusCode(500);
    res.send("Unable to create ontology");
    return;
  }

  // create root concept
  var swords = req.jsonData.stopwordList || null;
  var stmr = req.jsonData.stemmer || null;
  var root = new RootConcept(dataStore, swords, stmr);
  s.add(root);

  res.setStatusCode(201);

  var onto = qm.getStoreList().filter(function(store) {
    return store.storeName === ontologyName;
  })[0];
  // build ontology object
  onto.links = {
    "self": url_for("ontologies", ontologyName),
    "concepts":  url_for("concepts", null, ontologyName)
  };

  res.send(onto);
});


/// Read ontology definition 
http.onRequest("ontologies/<ontology>/", "GET", function (req, res) {
  console.say("OntoGen API - Concept ontology def");

  if(!req.hasOwnProperty("params")) {
    res.setStatusCode(400);
    res.send("Missing parameters");
    return;
  }
  var params = req.params;
  if(!params.hasOwnProperty("ontology")) { 
    res.setStatusCode(400);
    res.send("Missing parameter: ontology name");
    return;
  }
  var store = qm.store(params.ontology);
  if(store === null) {
    res.setStatusCode(404);
    res.send("Ontology '" + params.ontology + "' not found");
    return;
  }
  var onto = qm.getStoreList().filter(function(store) {
    return store.storeName === params.ontology;
  })[0];
  // build ontology object
  onto.links = {
    "self": url_for("ontologies", onto.storeName),
    "concepts":  url_for("concepts", null, onto.storeName)
  };
  res.send(onto);
});

  

/*
 * Concept
 */
/// Read - Get Al Concepts, @TODO add query parameter here
http.onRequest("ontologies/<ontology>/concepts/", "GET", function (req, res) {
  console.say("OntoGen API - Concept GET ALL");

  if(!req.hasOwnProperty("params")) {
    res.setStatusCode(400);
    res.send("Missing parameters");
    return;
  }
  var params = req.params;
  if(!params.hasOwnProperty("ontology")) { 
    res.setStatusCode(400);
    res.send("Missing parameter: ontology name");
    return;
  }
  var store = qm.store(params.ontology);
  if(store === null) {
    res.setStatusCode(404);
    res.send("Ontology '" + params.ontology + "' not found");
    return;
  }

  var concepts = [];
  for (var ii = 0; ii < store.length; ii++) {
    concepts.push(store[ii]);
  }

  res.send(concepts);
});

/// Concept - Read
http.onRequest("ontologies/<ontology>/concepts/<cid>/", "GET", function (req, res) {
  console.say("OntoGen API - Concept GET");

  if(!req.hasOwnProperty("params")) {
    res.setStatusCode(400);
    res.send("Missing parameters");
    return;
  }
  var params = req.params;
  if(!params.hasOwnProperty("ontology")) { 
    res.setStatusCode(400);
    res.send("Missing parameter: ontology name");
    return;
  }
  var store = qm.store(params.ontology);
  if(store === null) {
    res.setStatusCode(404);
    res.send("Ontology '" + params.ontology + "' not found");
    return;
  }
  if(!params.hasOwnProperty("cid")) { 
    res.setStatusCode(400);
    res.send("Missing parameter: concept id");
    return;
  }
  var conceptId = parseInt(params.cid);
  if(isNaN(conceptId)) {
    res.setStatusCode(400);
    res.send("Invalid concept id:" + params.cid);
    return;
  }
  var concept = store[conceptId];
  if(concept === null) {
    res.setStatusCode(404);
    res.send("concept '" + conceptId + "' not found");
    return;
  }

  res.send(concept); 
});

/// Concept - Create
http.onRequest("ontologies/<ontology>/concepts/", "POST", function (req, res) {
  console.say("OntoGen API - Concept POST");

  if(!req.hasOwnProperty("params")) {
    res.setStatusCode(400);
    res.send("Missing parameters");
    return;
  }
  var params = req.params;
  if(!params.hasOwnProperty("ontology")) { 
    res.setStatusCode(400);
    res.send("Missing parameter: ontology name");
    return;
  }
  var store = qm.store(params.ontology);
  if(store === null) {
    res.setStatusCode(404);
    res.send("Ontology '" + params.ontology + "' not found");
    return;
  }
  if(!req.hasOwnProperty("jsonData")) {
    res.setStatusCode(400);
    res.send("Missing data.");
    return;
  }

  // init concept object
  var concept = {};

  // concept name (required)
  var data = req.jsonData;
  if(!data.hasOwnProperty("name")) {
    res.setStatusCode(400);
    res.send("Missing concept name.");
    return;
  }
  concept.name = data.name;

  // concept parent (required)
  if(!data.hasOwnProperty("parentId")) {
    res.setStatusCode(400);
    res.send("Missing parent.");
    return;
  }
  var parentId = parseInt(data.parentId);
  if(isNaN(parentId) || parentId < 0) {
    res.setStatusCode(400);
    res.send("Invalid parent id:" + param.parentId);
    return;
  }
  var parentConcept = store[parentId];
  if(parentConcept === null) {
    res.setStatusCode(404);
    res.send("concept '" + parenttId + "' (parent) not found");
    return;
  }
  concept.parentId = {$record:parentId};

  // keywords
  concept.keywords = data.keywords || "";

  // Stopwords
  concept.stopwords = data.stopwords || store[parentId].stopwords;

  // Stemmer
  concept.stemmer = data.stemmer || store[parentId].stemmer;

  // docs - an array of ids
  var docs = data.docs || [];
  concept[docsJoinName] = [];
  for(var ii = 0; ii < docs.length; ii++) {
    concept[docsJoinName].push({$record: docs[ii]});
  }
  
  cid = store.add(concept);
  if(cid === null) {
    res.setStatusCode(500);
    res.send("Unable to add concept");
    return;
  }
  var addedConcept = store[cid];

  res.send(addedConcept);
});

/// Concept - Read Docs
http.onRequest("ontologies/<ontology>/concepts/<cid>/docs/", "GET", function (req, res) {
  console.say("OntoGen API - Concept GET docs");

  if(!req.hasOwnProperty("params")) {
    res.setStatusCode(400);
    res.send("Missing parameters");
    return;
  }
  var params = req.params;
  if(!params.hasOwnProperty("ontology")) { 
    res.setStatusCode(400);
    res.send("Missing parameter: ontology name");
    return;
  }
  var store = qm.store(params.ontology);
  if(store === null) {
    res.setStatusCode(404);
    res.send("Ontology '" + params.ontology + "' not found");
    return;
  }
  if(!params.hasOwnProperty("cid")) { 
    res.setStatusCode(400);
    res.send("Missing parameter: concept id");
    return;
  }
  var conceptId = parseInt(params.cid);
  if(isNaN(conceptId)) {
    res.setStatusCode(400);
    res.send("Invalid concept id:" + params.cid);
    return;
  }
  var concept = store[conceptId];
  if(concept === null) {
    res.setStatusCode(404);
    res.send("concept '" + conceptId + "' not found");
    return;
  }

  var rSet = concept.join(docsJoinName);
  var docs = [];
  for(var ii = 0; ii < rSet.length; ii++) {
    docs.push(rSet[ii]);
  }
  res.send(docs); 
});

/// Concept - Suggest sub-concepts
http.onRequest("ontologies/<ontology>/concepts/<cid>/suggest/", "GET", function (req, res) {
  console.say("OntoGen API - Concept GET suggestions");

  if(!req.hasOwnProperty("params")) {
    res.setStatusCode(400);
    res.send("Missing parameters");
    return;
  }
  var params = req.params;
  if(!params.hasOwnProperty("ontology")) { 
    res.setStatusCode(400);
    res.send("Missing parameter: ontology name");
    return;
  }
  var store = qm.store(params.ontology);
  if(store === null) {
    res.setStatusCode(404);
    res.send("Ontology '" + params.ontology + "' not found");
    return;
  }
  var storeName = params.ontology;

  if(!params.hasOwnProperty("cid")) { 
    res.setStatusCode(400);
    res.send("Missing parameter: concept id");
    return;
  }
  var conceptId = parseInt(params.cid);
  if(isNaN(conceptId)) {
    res.setStatusCode(400);
    res.send("Invalid concept id:" + params.cid);
    return;
  }
  var concept = store[conceptId];
  if(concept === null) {
    res.setStatusCode(404);
    res.send("concept '" + conceptId + "' not found");
    return;
  }

  var numSuggest = parseInt(req.args.numSuggest) || DEFAULT_SUGGESTIONS;
  var numIter = parseInt(req.args.numIter) || DEFAULT_ITER;
  var numKeywords = parseInt(req.args.numKeywords) || DEFAULT_NUM_KEYWORDS;
  var stemmer = req.args.stemmer || concept.stemmer;
  var stopwords = req.args.stopwords || concept.stopwords;



  var suggested = ontogen.suggestConcepts(storeName, docsJoinName, docsFieldName,
                                          stemmer, stopwords, conceptId,
                                          numSuggest, numIter, numKeywords);
  
  res.send(suggested); 
});

