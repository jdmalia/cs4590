/*
 * SOURCES:
 * 
 * https://github.com/janesconference/MorningStar/blob/master/audio/WAAMorningStar.js
 * http://developer.apple.com/library/safari/#documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/PlayingandSynthesizingSounds/PlayingandSynthesizingSounds.html
 */

var voices = new Array();
var generators = new Array();
var audioContext = null;

var notePlaying = false;

// This is the "initial patch" of the ADSR settings.  YMMV.
var currentEnvA = 7;  // Default: 7
var currentEnvD = 15; // Default: 15
var currentEnvS = 50; // Default: 50
var currentEnvR = 20; // Default: 20

// end initial patch

//Sine wave by default
var Wave = {"SINE": 0, "SQUARE": 1, "SAWTOOTH": 2, "TRIANGLE": 3, "NOISE": 4};
var waveType = Wave.SINE;  

//Filter controls
var highFreq = 20000; // For low pass and band pass
var lowFreq = 0; // For high pass and band pass

var currentRing = false;

//Set by volume nob (between 0 - 1)
var maxVol = 0.75;

generators[0] = new Generator(false, 0);
generators[1] = new Generator(false, 1);
generators[2] = new Generator(false, 2);

// the onscreen keyboard "ASCII-key-to-MIDI-note" conversion array
var keys = new Array( 256 );
keys[65] = 60; // = C4 ("middle C")
keys[87] = 61;
keys[83] = 62;
keys[69] = 63;
keys[68] = 64;
keys[70] = 65; // = F4
keys[84] = 66;
keys[71] = 67;
keys[89] = 68;
keys[72] = 69;
keys[85] = 70;
keys[74] = 71;
keys[75] = 72; // = C5
keys[79] = 73;
keys[76] = 74;
keys[80] = 75;
keys[186] = 76;
keys[222] = 77; // = F5
keys[221] = 78;
keys[13] = 79;
keys[220] = 80;

var effectChain = null;
var revNode = null;
var revGain = null;
var revBypassGain = null;
var volNode = null;

function impulseResponse( duration, decay ) {
    var sampleRate = audioContext.sampleRate;
    var length = sampleRate * duration;
    var impulse = audioContext.createBuffer(2, length, sampleRate);
    var impulseL = impulse.getChannelData(0);
    var impulseR = impulse.getChannelData(1);

    if (!decay)
        decay = 2.0;
    for (var i = 0; i < length; i++){
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return impulse;
}

function frequencyFromNoteNumber( note ) {
	return 440 * Math.pow(2,(note-69)/12);
}

function noteOn( note, velocity ) {
	maxVol = document.getElementById("vol").value;
	// Create a new synth node
	voices[note] = new Voice(note, velocity);
	var e = document.getElementById( "k" + note );
	if (e)
		e.classList.add("pressed");
	//Implementing filters here
	var freq = voices[note].originalFrequency;
	if (freq < lowFreq || freq > highFreq)
	{
		noteOff(note);
	}
}

function noteOff( note ) {
	if (voices[note] != null) {
		// Shut off the note playing and clear it 
		voices[note].noteOff();
		voices[note] = null;
		var e = document.getElementById( "k" + note );
		if (e)
			e.classList.remove("pressed");
	}

}

// 'value' is normalized to 0..1.
function controller( number, value ) {
	switch (number) {
		case 1:
			// do something with CC#1
			break;
		case 2:
			// do something with CC#2
			break;
	}
}

// 'value' is normalized to [-1,1]
function pitchWheel( value ) {
	var i;
	
	for (i in voices) {
		if (voices[i] && voices[i].osc)
			voices[i].osc.detune.value = value * 500;	// value in cents - detune major fifth.
	}
}

function HPF()
{
	lowFreq = 300;
	highFreq = 20000;
}

function LPF()
{
	lowFreq = 0;
	highFreq = 800;
}

function BAND()
{
	lowFreq = 300;
	highFreq = 800;
}

function noFilter()
{
	lowFreq = 0;
	highFreq = 20000;
}


function Generator(on, id)
{
	this.id = id;
	
	this.on = on;
	
	//SINE, SAWTOOTH, TRIANGLE, or NOISE
	this.wave = waveType;
	
	//ADSR
	this.attack = currentEnvA;
	this.decay = currentEnvD;
	this.sustain = currentEnvS;
	this.release = currentEnvR;
	
	//RING MODULATION
	this.ring = false;
}

function defaultSettings(gen)
{
	if (generators[gen].on)
	{
		generators[gen].on = false;
		
		waveType = Wave.SINE; 
		
		currentEnvA = 7;
		currentEnvD = 15;
		currentEnvS = 50;
		currentEnvR = 20;

		currentRing = false;
	}
}

Generator.prototype.changeOn = function (gen)
{
	var i;
	
	for (i=0; i<generators.length; i++)
	{
		generators[i].on = false;
		document.getElementById("off"+i).checked = true;
	}
	document.getElementById("on"+gen).checked = true;
	this.on = true;
	
	currentEnvA = generators[gen].attack;
	currentEnvD = generators[gen].decay;
	currentEnvS = generators[gen].sustain;
	currentEnvR = generators[gen].release;
	
	currentRing = generators[gen].ring;
	
	waveType = this.wave;
}

Generator.prototype.changeADSR = function ()
{
	this.attack = document.getElementById("attack"+this.id).value;
	this.decay = document.getElementById("decay"+this.id).value;
	this.sustain = document.getElementById("sustain"+this.id).value;
	this.release = document.getElementById("release"+this.id).value;
	
	if (this.on)
	{
		currentEnvA = this.attack;
		currentEnvD = this.decay;
		currentEnvS = this.sustain;
		currentEnvR = this.release;
	}
}

Generator.prototype.changeWave = function (type)
{
	this.wave = type;
	
	if (this.on)
	{
		waveType = type;
	}
}

Generator.prototype.changeRing = function ()
{
	this.ring = document.getElementById("ring"+this.id).checked;
	if (this.on)
	{
		currentRing = this.ring;
	}
}

function Voice( note, velocity ) {
	
	this.originalFrequency = frequencyFromNoteNumber( note );
	// create oscillator
	this.osc = audioContext.createOscillator();

	this.envelope = audioContext.createGainNode();
	
	if (!currentRing && waveType < 4)
	{
		this.osc.type = waveType;
	}
	else if (!currentRing)
	{
		var curveLength = 100;
		var curve1 = new Float32Array(curveLength);
		var curve2 = new Float32Array(curveLength);
		for (var i = 0; i < curveLength; i++)
		    curve1[i] = this.originalFrequency*Math.random();
		 
		for (var i = 0; i < curveLength; i++)
		    curve2[i] = this.originalFrequency*Math.random();
		 
		var waveTable = audioContext.createWaveTable(curve1, curve2);
		this.osc.setWaveTable(waveTable);
	}
	else
	{
		this.osc2 = audioContext.createOscillator();
		this.osc2.type = 1;
		this.osc.type = 3;
		this.osc2.frequency.setValueAtTime(this.originalFrequency, 0);
		this.osc2.connect(this.envelope);
	}
	this.osc.frequency.setValueAtTime(this.originalFrequency, 0);

	// create the volume envelope
    this.osc.connect( this.envelope );
	this.envelope.connect( effectChain );

	// set up the volume ADSR envelope
	var now = audioContext.currentTime;
	var envAttackEnd = now + (currentEnvA/10.0);

	this.envelope.gain.value = 0.0;
	this.envelope.gain.setValueAtTime( 0.0, now );
	this.envelope.gain.linearRampToValueAtTime( maxVol, envAttackEnd );
	this.envelope.gain.setTargetValueAtTime( (maxVol*currentEnvS/100.0), envAttackEnd, (maxVol*currentEnvD/100.0)+0.001 );

	this.osc.noteOn(0);
	
	if(currentRing) this.osc2.noteOn(0);
}

Voice.prototype.noteOff = function() {
	var now =  audioContext.currentTime;
	var release = now + (currentEnvR/10.0);	

	this.envelope.gain.cancelScheduledValues(now);
	this.envelope.gain.setValueAtTime( this.envelope.gain.value, now );  // this is necessary because of the linear ramp
	this.envelope.gain.setTargetValueAtTime(0.0, now, (currentEnvR/100));

	this.osc.noteOff( release );
	notePlaying = false;
}

var currentOctave = 3;

function keyDown( ev ) {
	var note = keys[ev.keyCode];
	if (note)
		noteOn( note + 12*(3-currentOctave), 0.75 );
//	console.log( "key down: " + ev.keyCode );

	var e = document.getElementById( "k" + note );
	if (e)
		e.classList.add("pressed");
	return false;
}

function keyUp( ev ) {
	var note = keys[ev.keyCode];
	if (note)
		noteOff( note + 12*(3-currentOctave) );
//	console.log( "key up: " + ev.keyCode );

	var e = document.getElementById( "k" + note );
	if (e)
		e.classList.remove("pressed");
	return false;
}

function pointerDown( ev ) {
	var note = parseInt( ev.target.id.substring( 1 ) );
	if (note != NaN)
		noteOn( note + 12*(3-currentOctave), 0.75 );
//	console.log( "mouse down: " + note );
	ev.target.classList.add("pressed");
	return false;
}

function pointerUp( ev ) {
	var note = parseInt( ev.target.id.substring( 1 ) );
	if (note != NaN)
		noteOff( note + 12*(3-currentOctave) );
//	console.log( "mouse up: " + note );
	ev.target.classList.remove("pressed");
	return false;
}

function initAudio() {
	try {
    	audioContext = new webkitAudioContext();
  	}
  	catch(e) {
    	alert('Web Audio API is not supported in this browser');
  	}

	window.addEventListener('keydown', keyDown, false);
	window.addEventListener('keyup', keyUp, false);

	// set up the master effects chain for all voices to connect to.

	// connection point for all voices
	effectChain = audioContext.createGainNode();

	// convolver for a global reverb - just an example "global effect"
    revNode = audioContext.createGainNode(); // createConvolver();

    // gain for reverb
	revGain = audioContext.createGainNode();
	revGain.gain.value = 0.1;

	// gain for reverb bypass.  Balance between this and the previous = effect mix.
	revBypassGain = audioContext.createGainNode();

	// overall volume control node
    volNode = audioContext.createGainNode();
    volNode.gain.value = 0.5; //Default 0.25

    effectChain.connect( revNode );
    effectChain.connect( revBypassGain );
    revNode.connect( revGain );
    revGain.connect( volNode );
    revBypassGain.connect( volNode );

    // hook it up to the "speakers"
    volNode.connect( audioContext.destination );

    // Synthesize a reverb impulse response (could use XHR to download one).
//	revNode.buffer = impulseResponse( 5.0, 2.0 );

	synthBox = document.getElementById("synthbox");

	var keys = document.querySelectorAll( ".key" );
	for (var i=0; i<keys.length; i++) {
		keys[i].addEventListener('pointerdown', pointerDown);
		keys[i].addEventListener('pointerup', pointerUp);
	}
	var kbOct = document.getElementById("kbd_oct");
	kbOct.onchange = function() { currentOctave = document.getElementById("kbd_oct").selectedIndex; }
}

window.onload=initAudio;