var synaptic = require('synaptic');
var async = require('async');
var _ = require('lodash');
var Architect = synaptic.Architect;
var Network = synaptic.Network;

var Learn = {
    input: [],
    output: 0,
    // Array of networks for current Genomes
    // (Genomes will be added the key `fitness`)
    genomes: [],
    point: 0,

    // Current state of learning [STOP, LEARNING]
    state: 'STOP',
    gamestate: 'OVER',
    gameEnd: true,

    // Current genome/generation tryout
    genome: 0,
    generation: 0,

    // Listners
    onGameEnd: null,
    onGameStart: null,
    onSensorData: null,
    // Set this, to verify genome experience BEFORE running it
    shouldCheckExperience: false,

};


// Initialize the Learner
Learn.init = function (genomeUnits, selection, mutationProb) {

    Learn.genome = 0;
    Learn.generation = 0;

    Learn.genomeUnits = genomeUnits;
    Learn.selection = selection;
    Learn.mutationProb = mutationProb;
}


// Build genomes before calling executeGeneration.
Learn.startLearning = function () {

    // Build genomes if needed
    while (Learn.genomes.length < Learn.genomeUnits) {
        Learn.genomes.push(Learn.buildGenome(5, 1));
    }

    Learn.executeGeneration();

}

// Builds a new genome based on the
// expected number of inputs and outputs
Learn.buildGenome = function (inputs, outputs) {
    console.log('Build genome '+(Learn.genomes.length+1));
    var network = new Architect.Perceptron(inputs, 6, 6 ,outputs);

    return network;
}


Learn.readSensors = function (input) {
    Learn.input = input;
    // Call sensor callback (to act)
    Learn.onSensorData && Learn.onSensorData();
}
// Given the entire generation of genomes (An array),
// applyes method `executeGenome` for each element.
// After all elements have completed executing:
//
// 1) Select best genomes
// 2) Does cross over (except for 2 genomes)
// 3) Does Mutation-only on remaining genomes
// 4) Execute generation (recursivelly)
Learn.executeGeneration = function (){
    if (Learn.state == 'STOP') {
        return;
    }

    Learn.generation++;
    console.log('Executing generation '+Learn.generation);

    Learn.genome = 0;

    async.mapSeries(Learn.genomes, Learn.executeGenome, function (argument) {

        // Kill worst genomes
        Learn.genomes = Learn.selectBestGenomes(Learn.selection);

        // Copy best genomes
        var bestGenomes = _.clone(Learn.genomes);

        // Cross Over ()
        while (Learn.genomes.length < Learn.genomeUnits - 2) {
            // Get two random Genomes
            var genA = _.sample(bestGenomes).toJSON();
            var genB = _.sample(bestGenomes).toJSON();

            // Cross over and Mutate
            var newGenome = Learn.mutate(Learn.crossOver(genA, genB));

            // Add to generation
            Learn.genomes.push(Network.fromJSON(newGenome));
        }

        // Mutation-only
        while (Learn.genomes.length < Learn.genomeUnits) {
            // Get two random Genomes
            var gen = _.sample(bestGenomes).toJSON();

            // Cross over and Mutate
            var newGenome = Learn.mutate(gen);

            // Add to generation
            Learn.genomes.push(Network.fromJSON(newGenome));
        }
        console.log('Completed generation '+Learn.generation);

            // Execute next generation
        Learn.executeGeneration();
    })
}


// Sort all the genomes, and delete the worst one
// untill the genome list has selectN elements.
Learn.selectBestGenomes = function (selectN){
    var selected = _.sortBy(Learn.genomes, 'fitness').reverse();

    while (selected.length > selectN) {
        selected.pop();
    }
    console.log('Fitness: '+_.map(selected, 'fitness').join(','));

    return selected;
}


// Waits the game to end, and start a new one, then:
// 1) Set's listener for sensorData
// 2) On data read, applyes the neural network, and
//    set it's output
// 3) When the game has ended and compute the fitness
Learn.executeGenome = function (genome, next){
    if (Learn.state == 'STOP') {
        return;
    }

    Learn.genome = Learn.genomes.indexOf(genome) + 1;

    var _startKeyInterval;
    Learn.startNewGame = function (next) {

        // Refresh state
        Learn.readGameState();

        // If game is already over, press space
        if (Learn.gamestate == 'OVER') {
            clearInterval(_startKeyInterval);

            // Set start callback
            Learn.onGameStart = function (argument) {
                clearInterval(_startKeyInterval);
                next && next();
            };


            // Refresh state
            Learn.readGameState();

        } else {
            // Wait die, and call recursive action
            Learn.onGameEnd = function () {
                Learn.startNewGame(next);
            }
        }


    }

    Learn.startNewGame(function (){

        // Reads sensor data, and apply network
        Learn.onSensorData = function (){
            var inputs = Learn.input;
            // Apply to network
            var output = genome.activate(inputs);

            Learn.setGameOutput(output);
        }

        // Wait game end, and compute fitness
        Learn.onGameEnd = function (point){
            point = point/10;
            console.log('Genome '+Learn.genome+' ended. Fitness: '+point);

            // Save Genome fitness
            genome.fitness = point;

            Learn.point = 0; //initialize point
            // Go to next genome
            next();
        }
    });

}
Learn.setGameOutput = function(output)
{
    console.log(output[0]);
    Learn.output = output[0];
}

Learn.readGameState = function () {
    // Read GameOver

    if (Learn.gameEnd&&Learn.gamestate != 'OVER') {
        Learn.gamestate = 'OVER';
        // Clear keys
        // Trigger callback and clear
        Learn.onGameEnd && Learn.onGameEnd(Learn.point);
        Learn.onGameEnd = null;

        // console.log('GAME OVER: '+GameManipulator.points);

    } else if (!Learn.gameEnd&&Learn.gamestate != 'PLAYING') {
        Learn.gamestate = 'PLAYING';
        // Clear points
         Learn.input = [];
         Learn.output = 0;

        Learn.onGameStart && Learn.onGameStart();
        Learn.onGameStart = null;

    }
}


// SPECIFIC to Neural Network.
// Those two methods convert from JSON to Array, and from Array to JSON
Learn.crossOver = function (netA, netB) {
    // Swap (50% prob.)
    if (Math.random() > 0.5) {
        var tmp = netA;
        netA = netB;
        netB = tmp;
    }

    // Clone network
    netA = _.cloneDeep(netA);
    netB = _.cloneDeep(netB);

    // Cross over data keys
    Learn.crossOverDataKey(netA.neurons, netB.neurons, 'bias');

    return netA;
}


// Does random mutations across all
// the biases and weights of the Networks
// (This must be done in the JSON to
// prevent modifying the current one)
Learn.mutate = function (net){
    // Mutate
    Learn.mutateDataKeys(net.neurons, 'bias', Learn.mutationProb);

    Learn.mutateDataKeys(net.connections, 'weight', Learn.mutationProb);

    return net;
}


// Given an Object A and an object B, both Arrays
// of Objects:
//
// 1) Select a cross over point (cutLocation)
//    randomly (going from 0 to A.length)
// 2) Swap values from `key` one to another,
//    starting by cutLocation
Learn.crossOverDataKey = function (a, b, key) {
    var cutLocation = Math.round(a.length * Math.random());

    var tmp;
    for (var k = cutLocation; k < a.length; k++) {
        // Swap
        tmp = a[k][key];
        a[k][key] = b[k][key];
        b[k][key] = tmp;
    }
}


// Given an Array of objects with key `key`,
// and also a `mutationRate`, randomly Mutate
// the value of each key, if random value is
// lower than mutationRate for each element.
Learn.mutateDataKeys = function (a, key, mutationRate){
    for (var k = 0; k < a.length; k++) {
        // Should mutate?
        if (Math.random() > mutationRate) {
            continue;
        }

        a[k][key] += a[k][key] * (Math.random() - 0.5) * 3 + (Math.random() - 0.5);
    }
}


module.exports = Learn;