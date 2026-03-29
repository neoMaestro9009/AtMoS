// Updated calculateBreathRate to consider 60 fps instead of 44100 sample rate

function calculateBreathRate(frames) {
    const frameRate = 60; // frames per second
    const breathRate = (frames / frameRate) * 60; // calculate breaths per minute
    return breathRate;
}

// Example usage: 
const frames = 120; // for example, over two seconds
console.log(calculateBreathRate(frames)); // logs the breath rate at 60 fps
