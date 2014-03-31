// Load required Node modules.
var restify = require('restify');
var fs = require('fs');
var js2xmlparser = require('js2xmlparser');

// Hard-coding paths is no good.
var modelPath = 'models';

// Keep track of my models.
var models = {};

// Create a RESTful server.
var server = restify.createServer();

// Restify pretty much doesn't work without this.
server.pre(restify.pre.sanitizePath());

// Enable parsing of the query string.
server.use(restify.queryParser());
server.use(restify.fullResponse());
server.use(restify.bodyParser());

// Add headers to allow cross site scripting. This is only necessary due to
// the nature of this assignment with a shared server and custom client code
// for each student.
server.use(
  function (request, response, next) 
    {
    // Website you wish to allow to connect
    response.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE');

    // Request headers you wish to allow
    response.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    response.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
    });

/* Commented out due to the nature of this assignment with a shared server and custom 
   client code for each student. Ideally, the server would also provide the client via
   the following mechanism.
server.get(
  '/', 
  function indexHTML(req, res, next) 
    {
    console.log('/');
    fs.readFile(
      __dirname + '/index.html', 
      function (err, data) 
        {
        if(err) 
          {
          next(err);
          return;
          }

        res.setHeader('Content-Type', 'text/html');
        res.writeHead(200);
        res.end(data);
        next();
        });
     }); */

// Construct a model path.
function buildModelPath(name)
  {
  return modelPath + '/' + name;
  }
      
// Load a model file.
function loadModel(name)
  {
  fs.readFile(
    buildModelPath(name),
    function (err, data) 
      {
      if(!err) 
        {
        // Models must be serialized JSON.
        var model = JSON.parse(data);
        
        if(model)
          {
          // Add the name for XML.
          model.name = name;
          
          models[name] = model;
          }
        }
      });
  }
  
// Read all models in the models directory.
function loadModels()
  {
  fs.readdir(
    modelPath,
    function (err, files)
      {
      if(!err)
        for(var i in files)
          loadModel(files[i]);
      });
  }
  
// Send a model.
function sendModel(model, request, response)
  {
  // Provide a name only output if requested.
  var object = model;
  
  if(request.query.name)
    object = { name: model.name };
    
  // Send in XML format.
  if(request.query.format && (request.query.format == 'xml'))
    {
    response.setHeader('Content-Type', 'text/xml');
    response.writeHead(200);
    
    // Convert the object to XML.
    response.end(js2xmlparser('model', object));
    }
    
  // Send in default JSON format.
  else
    response.send(object);
  }
  
// Send all models.
function sendModels(request, response)
  {
  // Provide a name only output if requested.
  var objects = models;
  
  if(request.query.name)
    {
    objects = new Array();
    
    for(var i in models)
      objects.push({ name: models[i].name });
    }
    
  // Send in XML format.
  if(request.query.format && (request.query.format == 'xml'))
    {
    // Convert the models object into an array.
    var array = new Array();
  
    for(var i in objects)
      array.push(objects[i]);
      
    response.setHeader('Content-Type', 'text/xml');
    response.writeHead(200);
    
    // Convert the array to XML. Wrap the array as a 'models' container with 'model'
    // elements.
    response.end(
      js2xmlparser(
        'models', 
        array, 
        { 
          wrapArray: { enabled: true, elementName: 'model'} 
        }));
    }
    
  // Send in default JSON format.
  else
    response.send(objects);
  }
  
// Make initial sure models are loaded.
loadModels();
  
// Return all models.
// curl -s "localhost:8080/models/?format=xml"
// curl -s "localhost:8080/models/?format=xml&name=1"
server.get(
  '/models',
  function (request, response, next)
    {
    sendModels(request, response);
    
    return next();
    });
  
// Return a specific model. 
// curl -s "localhost:8080/models/hemostat.js?format=json" > test.js 
server.get(
  '/models/:model',
  function (request, response, next)
    {
    // Get the requested model.
    var model = models[request.params.model];
    
    // Return the model if it exists.
    if(model)
      sendModel(model, request, response);
          
    // Not found.
    else
      response.send(404);

    return next();
    });

// Load a new model.  
// curl -X PUT --data-binary @test.js "localhost:8080/models/test.js"
server.put(
  '/models/:model',
  function (request, response, next)
    {
    // Hack this to allow either form uploads.
    if(request.files)
      fs.rename(
        request.files.file.path,
        buildModelPath(request.params.model),
        function (err) 
          {
          if(!err) 
            {
            // Load the model from disk.
            loadModel(request.params.model);
    
            // Return created.
            response.send(201);
    
            // Push the new model to everyone.
            var message = 
              { 
              action: 'newmodel',
              name: request.params.model
              };
              
            for(var i in wss.clients)
              wss.clients[i].send(JSON.stringify(message));      
            }
          else
            response.send(500);
          });
          
      // Or low-level CURL uploads.
      else
        fs.writeFile(
          buildModelPath(request.params.model), 
          request.body, 
          function (err) 
            {
            if(!err)
              {
              // Load the model from disk.
              loadModel(request.params.model);
    
              // Return created.
              response.send(201);
              }
            else
              response.send(500);
            });
    
    return next();
    });

// Delete a model.  
// curl -X DELETE "localhost:8080/models/test.js"
server.del(
  '/models/:model',
  function (request, response, next)
    {
    var path = buildModelPath(request.params.model);
    
    // Check existence of the file.
    fs.exists(
      path,
      function (exists)
        {
        // Unlink the file.
        if(exists)
          fs.unlink(
            path, 
            function (err) 
              {
              // Remove the model.
              delete models[request.params.model];
              
              // Return no content.
              response.send(204);

              // Push the deletion to everyone.
              var message = 
                { 
                action: 'deletemodel',
                name: request.params.model
                };
                
              for(var i in wss.clients)
                wss.clients[i].send(JSON.stringify(message));
              });
              
        // Not found.
        else
          response.send(404);
        });
    
    return next();
    });

// Load the ws module.
var WebSocketServer = require('ws').Server;

// Create a WebSocket server.
var wss = new WebSocketServer(server);

// Setup the WebSockets server.
wss.on(
  'connection', 
  
  function(ws) 
    {
    // On successful connection, setup message handlers.
    ws.on(
      'message', 
      function(object)
        {
        // Send the message back to everyone who didn't send it to me.
        for(var i in wss.clients)
          if(ws != wss.clients[i])
            wss.clients[i].send(object);
        });
    });

// Listen for connections.
server.listen(
  8080, 
  function () 
    {
    console.log('Server listening at %s', server.url);
    });
    