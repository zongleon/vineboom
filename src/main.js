import './style.css'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Chuck } from "webchuck";

let theChuck;

const fps = 30;
const DRAW_MARKERS = false;
let i = 1;

// const LEFT_INDICES = [105, 66, 52, 65];
// const RIGHT_INDICES = [296, 334, 295, 282];
const LEFT_INDICES = [63, 105, 66];
const RIGHT_INDICES = [296, 334, 293];
const LEFT_PUPIL = 468;
const RIGHT_PUPIL = 473;

// Modal dialog creation
function showModal() {
	return new Promise((resolve) => {
		const modal = document.createElement('div');
		modal.className = 'modal-overlay';
		modal.innerHTML = `
		<div class="modal-content">
			<h2>please?</h2>
			<p>we're gonna ask if we can use ur webcam so that we can figure out if you're *eyebrow raise*-ing</p>
			<button id="modal-accept" class="modal-accept-btn">Accept</button>
		</div>
		`;
		document.body.appendChild(modal);
		modal.querySelector('#modal-accept').onclick = async () => {
			document.body.removeChild(modal);
			theChuck = await Chuck.init([
				{ serverFilename: "../chuck/BOOM.ck", virtualFilename: "BOOM.ck" }, 
				{ serverFilename: "../chuck/vine-boom.wav", virtualFilename: "vine-boom.wav" }
			]);
			await theChuck.runFile("BOOM.ck");
			resolve();
		};
	});
}

async function setupWebcam() {
	const video = document.createElement('video');
	video.autoplay = true;
	video.playsInline = true;
	video.className = 'webcam-video';

	const stream = await navigator.mediaDevices.getUserMedia({ video: true });
	video.srcObject = stream;
	await video.play();
	return video;
}

async function loadFaceLandmarker() {
	const vision = await FilesetResolver.forVisionTasks(
		'/node_modules/@mediapipe/tasks-vision/wasm'
	);
	const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
			baseOptions: {
			modelAssetPath: '/models/face_landmarker.task',
			delegate: 'GPU',
		},
		outputFaceBlendshapes: true,
		outputFacialTransformationMatrixes: false,
		numFaces: 1,
		runningMode: "VIDEO",
	});
	return faceLandmarker;
}

function isEyebrowRaised(avgLeftBrow, avgRightBrow, leftPupil, rightPupil) {
	// Vector from left to right pupil
	const dx = rightPupil.x - leftPupil.x;
	const dy = rightPupil.y - leftPupil.y;
	const length = Math.sqrt(dx * dx + dy * dy);
	if (length === 0) return null;
	// Perpendicular unit vector (for "up" relative to the eyes)
	const perpX = -dy / length;
	const perpY = dx / length;

	// Project eyebrow-pupil vectors onto the perpendicular direction
	const leftVecX = avgLeftBrow.x - leftPupil.x;
	const leftVecY = avgLeftBrow.y - leftPupil.y;
	const rightVecX = avgRightBrow.x - rightPupil.x;
	const rightVecY = avgRightBrow.y - rightPupil.y;

	const leftProj = leftVecX * perpX + leftVecY * perpY;
	const rightProj = rightVecX * perpX + rightVecY * perpY;

	return Math.abs(rightProj - leftProj);
}

async function runFaceLandmarker(video, faceLandmarker) {
	const canvas = document.createElement('canvas');
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	canvas.className = 'overlay-canvas';
	document.getElementById("app").appendChild(canvas);
	const ctx = canvas.getContext('2d');

	// fps setup
	let fpsInterval, startTime, now, then, elapsed;

	function startRender(fps) {
		fpsInterval = 1000 / fps;
		then = Date.now();
		render();
	}

	async function render() {
		requestAnimationFrame(render);
		// only run at x fps
		now = Date.now();
		elapsed = now - then;

		if (elapsed <= fpsInterval) {
			return;
		}

		then = now - (elapsed % fpsInterval);

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		const results = await faceLandmarker.detectForVideo(video, performance.now());
		if (results.faceLandmarks && results.faceLandmarks.length > 0) {
			let faceMarks = results.faceLandmarks[0];
			if (DRAW_MARKERS) {
				ctx.strokeStyle = 'red';
				ctx.lineWidth = 2;
				for (const landmark of faceMarks) {
					ctx.beginPath();
					ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 2, 0, 2 * Math.PI);
					ctx.stroke();
				}
			}
			
			let avgLeft = {
				x: LEFT_INDICES.reduce((accum, val) => accum + faceMarks[val].x, 0) / LEFT_INDICES.length,
				y: LEFT_INDICES.reduce((accum, val) => accum + faceMarks[val].y, 0) / LEFT_INDICES.length,
			};
			let avgRight = {
				x: RIGHT_INDICES.reduce((accum, val) => accum + faceMarks[val].x, 0) / RIGHT_INDICES.length,
				y: RIGHT_INDICES.reduce((accum, val) => accum + faceMarks[val].y, 0) / RIGHT_INDICES.length,
			};
			let leftPupil = faceMarks[LEFT_PUPIL];
			let rightPupil = faceMarks[RIGHT_PUPIL];

			const raised = isEyebrowRaised(avgLeft, avgRight, leftPupil, rightPupil);
			theChuck.setFloat("diff", raised);	
		}
	}

	startRender(fps);
}

(async function main() {
	await showModal();
	const video = await setupWebcam();
	const faceLandmarker = await loadFaceLandmarker();
	runFaceLandmarker(video, faceLandmarker);
})();

document.body.onclick = () => {
	if (theChuck !== undefined && theChuck.context.state === "suspended") {
		theChuck.context.resume();
	}
}