const upload = document.getElementById("upload");
const search = document.getElementById("search");
const table = document.getElementById("table");
const statusText = document.getElementById("status");

let numbers = [];

const specialRules = {
"0":["01","10","12","21","23","32","34","43","45","54","56","65","67","76","78","87","89","98","90","09"],
"1":["02","20","13","31","24","42","35","53","46","64","57","75","68","86","79","97","80","08"],
"2":["03","30","14","41","25","52","36","63","47","74","58","85","69","96","70","07"],
"3":["04","40","15","51","26","62","37","73","48","84","59","95","60","06"],
"4":["05","50","16","61","27","72","38","83","49","94","50","05"],
"5":["06","60","17","71","28","82","39","93","40","04"],
"6":["07","70","18","81","29","92","30","03"],
"7":["08","80","19","91","20","02"],
"8":["09","90","10","01"],
"9":["09","90"]
};

upload.addEventListener("change", async e => {

const file = e.target.files[0];
if(!file) return;

statusText.innerText = "OCR Reading...";

const result = await Tesseract.recognize(
file,
"eng"
);

const text = result.data.text;

numbers = text.match(/\b\d{3}\b/g) || [];

drawTable(numbers);

statusText.innerText =
`Found ${numbers.length} numbers`;

});

function drawTable(data){

table.innerHTML = "";

let cols = Math.ceil(data.length / 24);

for(let r=0;r<24;r++){

const tr = document.createElement("tr");

for(let c=0;c<cols;c++){

const index = r + c*24;

const td = document.createElement("td");

td.textContent = data[index] || "";

tr.appendChild(td);
}

table.appendChild(tr);
}
}

search.addEventListener("input", ()=>{

const q = search.value.trim();

if(q===""){
drawTable(numbers);
return;
}

const result = numbers.filter(n =>
matchNumber(n,q)
);

drawTable(result);

});

function matchNumber(num,q){

if(q.includes("*")){

let regex =
"^" +
q.replace(/\*/g,"\\d")
+ "$";

return new RegExp(regex)
.test(num);
}

if(/^[0-9]$/.test(q)){

let pairs = specialRules[q] || [];

for(let p of pairs){

if(num.includes(p)){
return true;
}
}

return false;
}

return num.includes(q);
}