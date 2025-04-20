// vine boom
SndBuf boom => dac;
me.sourceDir() + "vine-boom.wav" => boom.read;
boom.samples() => boom.pos;

0 => global float diff;
0 => int reset;

while ( true ) {
    if (diff >= 0.009 && reset == 1) {
        0 => boom.pos;
        0 => reset;
    }
    if (diff < 0.006 && reset == 0) {
        1 => reset;   
    }
    150::ms => now;
}