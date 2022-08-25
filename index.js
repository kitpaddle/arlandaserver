const mongouri = process.env['MONGO_URI'];
const swedaviakey = process.env['SWEDAVIA_KEY'];
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const port = process.env['PORT'] || 8080;

/*
mongodb+srv://kitpaddle:<password>@cluster0.icwrw0m.mongodb.net/?retryWrites=true&w=majority
*/
const app = express();

let today;
let datetoday;
let dateminusone;
let dateminustwo;

let swedaviaData = [];


///// Mongo DB code
try{
  mongoose.connect(mongouri, {
  	useNewUrlParser: true,
  	useUnifiedTopology: true
  });
  console.log("Connected to database")
}catch{err => console.log(err)};

const dataSchema = new mongoose.Schema(
	{
    date: Date,
		datename: String,
		data: Object
	}
)

const DayData = mongoose.model('DayData', dataSchema);
// Serve website
//app.use("/", express.static(__dirname+"/public"));

app.use((req, res, next) => {
  res.append('Access-Control-Allow-Origin', '*');
  res.append('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Expose-Headers', '*')
  next();
})

// API Middleware 
app.get('/swedavia/:airport/:date', async (req, res) => {
  airportIATA = req.params.airport;
  searchDate = req.params.date;
  console.log("Asking server for "+airportIATA+" on the "+searchDate);

  let data = swedaviaData.find( e => e.date == searchDate);
  
  if (data != undefined) {
    console.log(data.date);
    console.log("Data already locally on server. Sending..");
    res.json(data);
    console.log("Sent back to website");
  }else{
    console.log("Data not in local cache");
    if((new Date(today).getTime())-(new Date(searchDate).getTime()) > 1000*60*60*24*2){
      console.log("Date older than D-2 days, check database.")
      DayData.exists({datename:searchDate}, function (err, doc) {
        if (err){
            console.log(err);
        }else{
          if(doc){
            console.log("Found in database")
            res.json(doc.data);
            console.log("Sent back to website");
          }else{
            console.log('Data not in database either. Nothing to return.');
          }
        }
      });
    }
    else{
      console.log("Date newer than D-2 days, check Swedavia API.")
      await getSwedaviaData(airportIATA, searchDate);
      res.json(swedaviaData.find(e => e.date == searchDate));
      console.log("Sent back to website");
    }
  }
});



function getSwedaviaData(airport, dateData) {
  console.log("Creating request for "+dateData);

  
  const arrRequest = axios.get('https://api.swedavia.se/flightinfo/v2/'+airport+'/arrivals/'+dateData, {
        method: 'GET',
        // Request headers
        headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Ocp-Apim-Subscription-Key': swedaviakey,}

  });
  const depRequest = axios.get('https://api.swedavia.se/flightinfo/v2/'+airport+'/departures/'+dateData, {
        method: 'GET',
        // Request headers
        headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Ocp-Apim-Subscription-Key': swedaviakey,}
  });
  console.log("Request created. Sending..");

  return new Promise((resolve, reject) => {
    axios.all([arrRequest, depRequest]).then(axios.spread((...responses) => {
    
    console.log('Request sent. Status: '+responses[0].status+' '+responses[1].status);
      
    let responseArr = responses[0].data;
    let responseDep = responses[1].data;

    if(swedaviaData.length!=0){
      let r = swedaviaData.filter( e => e.date == dateData);
      if(r.length>0){
        console.log("Already saved locally");
      }else{
        swedaviaData.push({'date': dateData, 'arrivalData': responseArr, 'departureData': responseDep});
        checkCacheLength();
      }
    }
      
    else{
      swedaviaData.push({'date': dateData, 'arrivalData': responseArr, 'departureData': responseDep});
      checkCacheLength();
    }

    console.log("Got response and saved it on server");
    console.log('Local data array containing: '+swedaviaData.length+' dates');
    resolve();
    
    })).catch(errors => {
      console.log('FAILED HTTP REQUEST TO SWEDAVIA!');
      console.log(errors);
      reject();
    });
    
  });
}

function checkCacheLength(){
  if (swedaviaData.length > 20){
    swedaviaData.shift();
    console.log("Capping local cache to 20 days.");
  }
}

// Getting dates
async function updateData(){
  
  today = new Date();
  let offset = today.getTimezoneOffset();
  today = new Date(today.getTime() - (offset*60*1000));
  datetoday = today.toISOString().split('T')[0];

  let todayMinusOne = new Date();
  todayMinusOne.setDate(today.getDate()-1);
  dateminusone = todayMinusOne.toISOString().split('T')[0];

  let todayMinusTwo = new Date();
  todayMinusTwo.setDate(today.getDate()-2);
  dateminustwo = todayMinusTwo.toISOString().split('T')[0]

  console.log('Updating dates. Today is '+datetoday);
  console.log('Fetching D-1 and D-2 to see if they can be saved to database:');  

  await getSwedaviaData('ARN', dateminusone);
  let y1 = swedaviaData.find(e => e.date == dateminusone)
  await getSwedaviaData('ARN', dateminustwo);
  let y2 = swedaviaData.find(e => e.date == dateminustwo)
    
  DayData.count({}, function( err, count){
    if (err) console.log(err)
    else console.log("Number of days in database:", count );
  });

  console.log('Check if D-1 is already saved in database..');
  DayData.exists({datename:dateminusone}, function (err, doc) {
    if (err){
        console.log(err)
    }else{
        if(doc){
          console.log('D-1 already exists. Not saving it');
        }else{
          console.log("D-1 doesn't exist. Adding it..");
          let newEntry = new DayData({date: new Date(dateminusone), datename: dateminusone, data: y1});
          newEntry.save();
          console.log('Saved D-1 to database');
        }
    }
  });
  console.log('Check if D-2 is already saved in database..');
  DayData.exists({datename:dateminustwo}, function (err, doc) {
    if (err){
        console.log(err)
    }else{
        if(doc){
          console.log('D-2 already exists. Not saving it');
        }else{
          console.log("D-2 doesn't exist. Adding it..");
          let newEntry = new DayData({date: new Date(dateminustwo), datename: dateminustwo, data: y2});
          newEntry.save();
          console.log('Saved D-2 to database');
        }
    }
  });
}

updateData();

setInterval(updateData, 1000 * 60 * 60 * 24);

// Starting server and listening
app.listen(port, () => {
  console.log('server started');
});
//getSwedaviaData('ARN','arrivals', new Date().)