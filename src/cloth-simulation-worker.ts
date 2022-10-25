/*
 * Cesium Cloth Primitive
 * Written by Fabrice Lainard, 2022/2023
 * https://www.flprogramming.fr
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

// cesium
import { Cartesian3, Transforms, Matrix4 } from 'cesium';
// intersection test
import { intersect, number } from 'mathjs';
// handhsaking protocol between the worker and the main thread
import {
  WorkerMessage,
  WorkerCmd,
  ClothBuildedMsg,
  BuildClothMsg,
  RedrawClothMsg,
  ClothForceAndCollisionMsg,
  StartStopSimulationMsg,
  CollisionSphere,
} from './cloth-handshaking';
// configuration used to build a cloth
import { ClothConfiguration } from './cloth-configuration';

// ------------------------------------------------------------------------------
// the worker
const ctxWorker: Worker = self as any;
let gClothSimulation: ClothSimulation | undefined;

// ------------------------------------------------------------------------------

/**
 * receiving messages from the main thread
 */
onmessage = async (event) => {
  const msg: WorkerMessage = event.data;
  switch (msg.cmd) {
    // Asks the worker to build a new cloth.
    case WorkerCmd.BuildCloth:
      {
        const param: BuildClothMsg = msg.param;
        gClothSimulation = new ClothSimulation(param.conf, param.clothID);
      }
      break;
    case WorkerCmd.UpdateClothForceAndCollision:
      {
        if (gClothSimulation) {
          const param: ClothForceAndCollisionMsg = msg.param;
          gClothSimulation.updateClothForceAndCollision(param);
        }
      }
      break;
    case WorkerCmd.startStopSimulation:
      {
        if (gClothSimulation) {
          const param: StartStopSimulationMsg = msg.param;
          gClothSimulation.canRun = param.run;
        }
      }
      break;


  }
};

// ------------------------------------------------------------------------------

/**
 * Cloth simulation class
 * Builds the elements of the geometry of a cloth in cartesian space
 * Position of the cloth corners in cartesian coordinates (https://www.keene.edu/campus/maps/tool/)
 *
 *         P1 *---|----|----|----|----|----* p2   (P1->p2 is width axis)
 *            |---|----|----|----|----|----|      (P2->p4 is height axis)
 *            |---|----|----|----|----|----|
 *            |---|----|----|----|----|----|
 *            |---|----|----|----|----|----|
 *            |---|----|----|----|----|----|
 *         P4 *---|----|----|----|----|----* p3
 *
 * Based on the example of Jesper Mosegaard (https://viscomp.alexandra.dk/index2fa7.html?p=147)
 */

export class ClothSimulation {
  /**
   * Unique identifier of the cloth
   */
  private clothID: number = 0;

  /**
   * If true the simulatin loop can run
   */
  public canRun = true;

  /**
   * The center of the cloth in cartesian space
   */
  private center = Cartesian3.ZERO;
  /**
   * The radius of the bounding sphere around the cloth
   */
  private radius = 1;

  /**
   * Number of particles across the width
   */
  private nbParticlesWidth = 0;
  /**
   * Number of particles along the height
   */
  private nbParticlesHeight = 0;

  /**
   * width between two particles on x axis
   */
  private lengthOnWidthAxis = 0;

  /**
   * width between two particles on y axis
   */
  private lengthOnHeightAxis = 0;

  /**
   * Position of the particles
   */
  private particlePositions = new Float64Array(1);

  /**
   * Position of the particles high bits.
   * Data are allocated in a SharedBuffer.
   * The position buffer is compressed for a better rendering precision.
   * (here the high part of the 64 bits word)
   */
  private particlePositionsHigh = new Float32Array(1);
  /**
   * Position of the particles low bits.
   * Data are allocated in a SharedBuffer.
   * The position buffer is compressed for a better rendering precision.
   * (here the low part of the 64 bits word)
   */
  private particlePositionsLow = new Float32Array(1);

  /**
   * Last position of the particles
   */
  private lastParticlePositions = new Float64Array(1);
  /**
   * Normals of the particles
   */
  private particleNormals = new Float32Array(1);

  /**
   * Textures coordinates of the particles
   */
  private particleTextureCoordinates = new Float32Array(1);

  /**
   * Acceleration of the particles
   */
  private particleAccelerations = new Float32Array(1);

  /**
   * WebGl triangle indices
   */
  private triangleIndices = new Uint16Array(1);

  /**
   * Shared buffer used to share position in 64 bits
   */
  private particlePositionsSharedArrayBuffer: SharedArrayBuffer | undefined;

  /**
   * Shared buffer used to share position between main thread and worker.
   * The position buffer is compressed for a better rendering precision.
   * (here the high part of the 64 bits word)
   */
  private particlePositionsSharedArrayBufferHigh: SharedArrayBuffer | undefined;

  /**
   * Shared buffer used to share position between main thread and worker.
   * The position buffer is compressed for a better rendering precision.
   * (here the low part of the 64 bits word)
   */
  private particlePositionsSharedArrayBufferLow: SharedArrayBuffer | undefined;

  /**
   * Shared buffer used to share normals between main thread and worker
   */
  private particleNormalsSharedArrayBuffer: SharedArrayBuffer | undefined;

  /**
   * Shared buffer used to share textures coordinates between main thread and worker
   */
  private particleTextureCoordinatesSharedArrayBuffer: SharedArrayBuffer | undefined;

  /**
   * Shared buffer used to share triangles indices between main thread and worker
   */
  private triangleIndicesSharedArrayBuffer: SharedArrayBuffer | undefined;

  /**
   * Indicates if a particle has the possibility to move or if it is fixed at its current position
   */
  private isPositionFixed: boolean[] = []; // can the particle move or not ? used to pin parts of the cloth

  /**
   * Number of elements in position / normal buffer
   */
  private vertexBufferCount = 0;

  /**
   * Number of triangle indices
   */
  private triangleIndicesCount = 0;

  /**
   * Constraints between particles
   */
  private particleConstraints: Constraint[] = [];

  /**
   * Temporary buffer used in computation
   */
  private r2 = new Cartesian3(0, 0, 0);

  /**
   * Temporary buffer used in computation
   */
  private normal = new Cartesian3(0, 0, 0);

  /**
   * How much to damp the cloth simulation each frame
   */
  private damping = 0.01;

  /**
   *  How large time step each particle takes each frame
   */
  private timeStepPerFrame = 0.5 * 0.5;

  /**
   * How many iterations of constraint satisfaction 
   */
  private nbSimulationIterations = 15;

  /**
   * Refresh frequency 
   */
  private updateFrequency = 60;

  /**
   * Connect secondary neighbors for each particles
   */
  private connectingSecondaryNeighbors = true;

  /**
   * Mass of all particles
   */
  private particleMass = 1;

  /**
   * Actual cloth configuration
   */

  private config: ClothConfiguration;

  /**
   * List of collision spheres
   */
  private collisionSpheres: CollisionSphere[] = [];

  /**
   * Add noise to the wind
   */
  private windNoiseStep = 0;


  /**
   * Builds a geometry based on the four corners of the cloth
   * @param viewer cesium viewer
   * @param config the configuration used to build the cloth
   */
  public constructor(config: ClothConfiguration, clothID: number) {
    this.config = config;
    this.clothID = clothID;
    if (config.nbSimulationIterations) {
      this.nbSimulationIterations = config.nbSimulationIterations;
    }
    if (config.updateFrequency) {
      this.updateFrequency = config.updateFrequency;
    }
    if (config.connectingSecondaryNeighbors) {
      this.connectingSecondaryNeighbors = config.connectingSecondaryNeighbors;
    }

    // build cloth
    this.build();

    // informs the main thread that the cloth is created
    this.sendOncreatedMsg();
    this.refreshCloth();
    const self = this;
    // simulation loop
    setInterval(() => {
      if (self.canRun) {
        this.updateSimulation();
        this.refreshCloth();
      }
    }, this.updateFrequency);
  }

  /**
   * informs the main thread that the cloth is created
   */
  private sendOncreatedMsg() {
    console.log("Cloth builed with id : 'cloth-" + this.clothID + "'");
    console.log(' - nb_particles_width: ' + this.nbParticlesWidth + ' nb_particles_height: ' + this.nbParticlesHeight);
    console.log(' - vertex buffer count:' + this.vertexBufferCount);


    const param: ClothBuildedMsg = {
      clothID: this.clothID,
      nbParticlesWidth: this.nbParticlesWidth,
      nbParticlesHeight: this.nbParticlesHeight,
      particlePositions: this.particlePositionsSharedArrayBuffer!,
      center: this.center,
      radius: this.radius,
    };
    const msg: WorkerMessage = {
      cmd: WorkerCmd.ClothBuilded,
      param,
    };
    ctxWorker.postMessage(msg);
  }

  /**
   * Asks the main thread to redraw the cloth
   */
  private refreshCloth() {
    let sphereID = 0;
    // smooth shading
    this.resetNormals();
    this.computeNormals();

    // encode in two 32 bits floats each position 
    this.encodePositions();
    // send msg
    this.collisionSpheres.forEach((s) => (s.id = sphereID++));
    const redrawParam: RedrawClothMsg = {
      particlePositions: this.particlePositionsSharedArrayBuffer!,
      particlePositionsHigh: this.particlePositionsSharedArrayBufferHigh!,
      particlePositionsLow: this.particlePositionsSharedArrayBufferLow!,
      normals: this.particleNormalsSharedArrayBuffer!,
      textureCoordinates: this.particleTextureCoordinatesSharedArrayBuffer!,
      triangleIndices: this.triangleIndicesSharedArrayBuffer!,
      clothID: this.clothID,
      nb_particles_width: this.nbParticlesWidth,
      nb_particles_height: this.nbParticlesHeight,
      collisionSpheres: this.collisionSpheres,
    };
    const redrawMsg: WorkerMessage = {
      cmd: WorkerCmd.RedrawCloth,
      param: redrawParam,
    };
    ctxWorker.postMessage(redrawMsg);
  }

  // ------------------------------------------------------------------------------
  // ----- Simulation
  // ------------------------------------------------------------------------------

  /**
   * Compute and refresh data
   */
  private updateSimulation() {
    // add forces
    this.addGravity();
    this.windForce();
    // simulation
    this.simulationStep();

    // Collisions
    this.collisionSpheres.forEach((s) => {
      this.computeSphereCollision(s);
    });


  }

  /**
   * Compute the next position of all particles
   */
  private simulationStep() {
    // constraints
    for (let i = 0; i < this.nbSimulationIterations; i++) {
      this.particleConstraints.forEach((c) => {
        this.satisfyConstraint(c);
      });
    }

    // physic simulation
    for (let y = 0; y < this.nbParticlesHeight; y++) {
      for (let x = 0; x < this.nbParticlesWidth; x++) {
        this.particleTimeStep(this.getIndex(x, y));
      }
    }
  }

  /**
   * Particle motion using Verlet integration
   * @returns
   */
  public particleTimeStep(idx: number) {
    const fixed = this.isPositionFixed[idx];
    if (fixed) return;

    const ox = this.lastParticlePositions[idx],
      oy = this.lastParticlePositions[idx + 1],
      oz = this.lastParticlePositions[idx + 2];
    const x = this.particlePositions[idx],
      y = this.particlePositions[idx + 1],
      z = this.particlePositions[idx + 2];
    const ax = this.particleAccelerations[idx],
      ay = this.particleAccelerations[idx + 1],
      az = this.particleAccelerations[idx + 2];
    const tx = x,
      ty = y,
      tz = z;

    const nx = x + (x - ox) * (1.0 - this.damping) + ax * this.timeStepPerFrame;
    const ny = y + (y - oy) * (1.0 - this.damping) + ay * this.timeStepPerFrame;
    const nz = z + (z - oz) * (1.0 - this.damping) + az * this.timeStepPerFrame;

    this.particlePositions[idx] = nx;
    this.particlePositions[idx + 1] = ny;
    this.particlePositions[idx + 2] = nz;

    this.lastParticlePositions[idx] = tx;
    this.lastParticlePositions[idx + 1] = ty;
    this.lastParticlePositions[idx + 2] = tz;

    this.particleAccelerations[idx] = 0;
    this.particleAccelerations[idx + 1] = 0;
    this.particleAccelerations[idx + 2] = 0;
  }

  // ------------------------------------------------------------------------------
  // ----- Constraint
  // ------------------------------------------------------------------------------

  /**
   * Modifies the position in order to keep the relative distance between the particles.
   * This relative distance is initialized at the very beginning.
   * @param constraint
   */
  private satisfyConstraint(constraint: Constraint) {
    const x1 = this.particlePositions[constraint.idx1],
      y1 = this.particlePositions[constraint.idx1 + 1],
      z1 = this.particlePositions[constraint.idx1 + 2];
    const x2 = this.particlePositions[constraint.idx2],
      y2 = this.particlePositions[constraint.idx2 + 1],
      z2 = this.particlePositions[constraint.idx2 + 2];
    const dx = x2 - x1,
      dy = y2 - y1,
      dz = z2 - z1;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const deltaDist = 1 - constraint.distance / dist;
    const cvx = dx * deltaDist * 0.5,
      cvy = dy * deltaDist * 0.5,
      cvz = dz * deltaDist * 0.5;

    if (!this.isPositionFixed[constraint.idx1])
      (this.particlePositions[constraint.idx1] += cvx),
        (this.particlePositions[constraint.idx1 + 1] += cvy),
        (this.particlePositions[constraint.idx1 + 2] += cvz);
    if (!this.isPositionFixed[constraint.idx2])
      (this.particlePositions[constraint.idx2] -= cvx),
        (this.particlePositions[constraint.idx2 + 1] -= cvy),
        (this.particlePositions[constraint.idx2 + 2] -= cvz);
  }

  /**
   * Add a constraint between two particles
   * @param idx1
   * @param idx2
   */
  private addConstraint(idx1: number, idx2: number) {
    // compute distance
    const x1 = this.particlePositions[idx1],
      y1 = this.particlePositions[idx1 + 1],
      z1 = this.particlePositions[idx1 + 2];
    const x2 = this.particlePositions[idx2],
      y2 = this.particlePositions[idx2 + 1],
      z2 = this.particlePositions[idx2 + 2];
    const dx = x2 - x1,
      dy = y2 - y1,
      dz = z2 - z1;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // add constraint
    this.particleConstraints.push({
      idx1,
      idx2,
      distance: dist,
    });
  }

  // ------------------------------------------------------------------------------
  // ----- Forces & Collisions
  // ------------------------------------------------------------------------------

  /**
   * Add or remove forces and collision objects
   * @param clothForceAndCollisionMsg
   * @returns
   */
  public updateClothForceAndCollision(clothForceAndCollisionMsg: ClothForceAndCollisionMsg) {
    if (clothForceAndCollisionMsg.gravity) this.config.gravity = clothForceAndCollisionMsg.gravity;
    if (clothForceAndCollisionMsg.wind) this.config.wind = clothForceAndCollisionMsg.wind;
    if (clothForceAndCollisionMsg.collisionSpheres) this.collisionSpheres = clothForceAndCollisionMsg.collisionSpheres;

    if (clothForceAndCollisionMsg.fixedParticles) {
      clothForceAndCollisionMsg.fixedParticles.forEach((p) => {
        this.setFixed(this.getIndex(p.particleX, p.particleY), p.isFixed, p.newPosition);

      })
    }
  }

  /**
   * Add gravity to all particles
   */
  private addGravity() {
    if (Cartesian3.equals(this.config.gravity, Cartesian3.ZERO)) return;
    const transform = Transforms.northEastDownToFixedFrame(this.config.p1);
    const g = Matrix4.multiplyByPoint(transform, this.config.gravity, new Cartesian3());
    Cartesian3.normalize(g, g);
    Cartesian3.multiplyByScalar(g, -this.timeStepPerFrame, g);
    this.addForceToAllParticles(g);
  }

  /**
   * Add a force to the given particle
   * @param idx
   * @param f
   */
  public addForce(idx: number, f: Cartesian3) {
    this.particleAccelerations[idx] += f.x / this.particleMass;
    this.particleAccelerations[idx + 1] += f.y / this.particleMass;
    this.particleAccelerations[idx + 2] += f.z / this.particleMass;
  }

  /**
   * Add force to all particles
   * @param f
   */
  public addForceToAllParticles(f: Cartesian3) {
    const count = this.vertexBufferCount;
    const fx = f.x / this.particleMass;
    const fy = f.y / this.particleMass;
    const fz = f.z / this.particleMass;
    for (let idx = 0; idx < count; idx += 3) {
      const fixed = this.isPositionFixed[idx];
      if (!fixed) {
        this.particleAccelerations[idx] += fx;
        this.particleAccelerations[idx + 1] += fy;
        this.particleAccelerations[idx + 2] += fz;
      }
    }
  }






  /**
   * Add wind for to all particles
   */
  public windForce() {
    if (Cartesian3.equals(this.config.wind, Cartesian3.ZERO)) return;

    let wind = this.config.wind;
    const windNoise = this.addWindNoise();
    if (windNoise) {
      wind = windNoise;
    }
    let pos1 = 0;
    let pos2 = 0;
    let pos3 = 0;
    for (let x = 0; x < this.nbParticlesWidth - 1; x++) {
      for (let y = 0; y < this.nbParticlesHeight - 1; y++) {
        pos1 = this.getIndex(x, y);
        pos2 = this.getIndex(x + 1, y);
        pos3 = this.getIndex(x, y + 1);
        this.addWindForcesForTriangle(pos1, pos2, pos3, wind);
        pos1 = this.getIndex(x + 1, y);
        pos2 = this.getIndex(x, y + 1);
        pos3 = this.getIndex(x + 1, y + 1);
        this.addWindForcesForTriangle(pos1, pos2, pos3, wind);
      }
    }
  }



  /**
   * Add noise to the wind
   */
  private addWindNoise() {
    if (this.windNoiseStep++ % 1000 === 0) {
      const noise = 0.001;
      const wind = new Cartesian3(this.config.wind.x, this.config.wind.y, this.config.wind.z);
      wind.x += noise;
      wind.y += noise;
      this.windNoiseStep = 0;
      return wind;
    }
    return undefined;
  }

  /**
   * Add ind for to a triangle
   * @param idx1
   * @param idx2
   * @param idx3
   * @param direction
   */
  private addWindForcesForTriangle(idx1: number, idx2: number, idx3: number, direction: Cartesian3) {
    const normal = this.calcTriangleNormal(idx1, idx2, idx3);
    const force = Cartesian3.multiplyByScalar(normal, Cartesian3.dot(normal, direction), this.r2);

    this.addForce(idx1, force);
    this.addForce(idx2, force);
    this.addForce(idx3, force);
  }

  /**
   * Add forces due to a sphere in space
   */
  private computeSphereCollision(collisionSphere: CollisionSphere) {
    if (!collisionSphere) return;
    if (!collisionSphere.dt) collisionSphere.dt = 0;
    collisionSphere.sphereCenter = Cartesian3.lerp(
      collisionSphere.sphereCenter,
      collisionSphere.sphereDestination,
      collisionSphere.dt,
      new Cartesian3(),
    );
    collisionSphere.dt += collisionSphere.speed;

    const relativeCenter = collisionSphere.sphereCenter;
    for (let x = 0; x < this.nbParticlesWidth; x++) {
      for (let y = 0; y < this.nbParticlesHeight; y++) {
        const idx = this.getIndex(x, y);
        const fixed = this.isPositionFixed[idx];
        if (fixed) continue;

        const x1 = this.particlePositions[idx],
          y1 = this.particlePositions[idx + 1],
          z1 = this.particlePositions[idx + 2];
        // pos - sphere
        let vx = x1 - relativeCenter.x,
          vy = y1 - relativeCenter.y,
          vz = z1 - relativeCenter.z;
        // length
        const l = Math.sqrt(vx * vx + vy * vy + vz * vz);

        // collision?
        if (l < collisionSphere.sphereRadius) {
          // project on sphere surface
          const ray = collisionSphere.sphereRadius - l;
          // normalize v
          vx /= l;
          vy /= l;
          vz /= l;
          this.particlePositions[idx] += vx * ray;
          this.particlePositions[idx + 1] += vy * ray;
          this.particlePositions[idx + 2] += vz * ray;
        }
      }
    }
  }

  // ------------------------------------------------------------------------------
  // ----- Normals
  // ------------------------------------------------------------------------------

  /**
   * Compute normal
   */
  private computeNormals() {
    let pos1 = 0;
    let pos2 = 0;
    let pos3 = 0;

    for (let y = 0; y <= this.nbParticlesHeight - 2; y++) {
      for (let x = 0; x <= this.nbParticlesWidth - 2; x++) {
        pos1 = this.getIndex(x, y);
        pos2 = this.getIndex(x + 1, y);
        pos3 = this.getIndex(x, y + 1);

        let normal = this.calcTriangleNormal(pos1, pos2, pos3);

        this.addToNormal(pos1, normal);
        this.addToNormal(pos2, normal);
        this.addToNormal(pos3, normal);

        pos1 = this.getIndex(x + 1, y);
        pos2 = this.getIndex(x + 1, y + 1);
        pos3 = this.getIndex(x, y + 1);

        normal = this.calcTriangleNormal(pos1, pos2, pos3);

        this.addToNormal(pos1, normal);
        this.addToNormal(pos2, normal);
        this.addToNormal(pos3, normal);
      }
    }
    this.normalizeNormals();
  }

  /**
   * Reset all normals to (0,0,1)
   */
  public resetNormals() {
    const count = this.vertexBufferCount;
    for (let idx = 0; idx < count; idx += 3) {
      this.particleNormals[idx] = 0;
      this.particleNormals[idx + 1] = 0;
      this.particleNormals[idx + 2] = 0;
    }
  }

  /**
   * Normalize all normals
   */
  public normalizeNormals() {
    const count = this.vertexBufferCount;
    for (let idx = 0; idx < count; idx += 3) {
      let x = this.particleNormals[idx],
        y = this.particleNormals[idx + 1],
        z = this.particleNormals[idx + 2];
      // normalize
      const norm = Math.sqrt(x * x + y * y + z * z);
      x = x / norm;
      y = y / norm;
      z = z / norm;
      this.particleNormals[idx] = x;
      this.particleNormals[idx + 1] = y;
      this.particleNormals[idx + 2] = z;
    }
  }

  /**
   * Adds normal to the particle
   * @param idx
   * @param normal
   */
  public addToNormal(idx: number, normal: Cartesian3) {
    this.particleNormals[idx] += normal.x;
    this.particleNormals[idx + 1] += normal.y;
    this.particleNormals[idx + 2] += normal.z;
  }

  /**
   * Retrieve the normal vector of the triangle defined by the position of the particles p1, p2, and p3.
   * The magnitude of the normal vector is equal to the area of the parallelogram defined by p1, p2 and p3
   * @param idx1
   * @param idx2
   * @param idx3
   * @returns
   */
  private calcTriangleNormal(idx1: number, idx2: number, idx3: number): Cartesian3 {
    const x1 = this.particlePositions[idx1],
      y1 = this.particlePositions[idx1 + 1],
      z1 = this.particlePositions[idx1 + 2];
    const x2 = this.particlePositions[idx2],
      y2 = this.particlePositions[idx2 + 1],
      z2 = this.particlePositions[idx2 + 2];
    const x3 = this.particlePositions[idx3],
      y3 = this.particlePositions[idx3 + 1],
      z3 = this.particlePositions[idx3 + 2];
    const v1x = x2 - x1,
      v1y = y2 - y1,
      v1z = z2 - z1;
    const v2x = x3 - x1,
      v2y = y3 - y1,
      v2z = z3 - z1;

    // cross product
    const x = v1y * v2z - v1z * v2y;
    const y = v1z * v2x - v1x * v2z;
    const z = v1x * v2y - v1y * v2x;

    // normalize
    const norm = Math.sqrt(x * x + y * y + z * z);
    this.normal.x = x / norm;
    this.normal.y = y / norm;
    this.normal.z = z / norm;

    return this.normal;
  }

  // ------------------------------------------------------------------------------
  // ----- Positions
  // ------------------------------------------------------------------------------

  /**
   * Builds the elements of the geometry of a cloth in cartesian space
   *  Position of the cloth corners in cartesian coordinates (https://www.keene.edu/campus/maps/tool/)
   *
   *         P1 *---|----|--w-|----|----|----* p2   (P1->p2 is width axis : nb_particles_width)
   *            |---|----|----|----|----|----|      (P2->p4 is height axis : nb_particles_height)
   *            |---|----|----|----|----|----|
   *            h---|----|--?-|----|----|----h
   *            |---|----|----|----|----|----|
   *            |---|----|----|----|----|----|
   *         P4 *---|----|--w-|----|----|----* p3
   *
   * This function also calculates texture coordinates on the grid :
   *
   *            +-----------+-----------+-----------+-----------+---    ---+-----------+
   *            |           |           |           |           |          |           |
   *            |           |           |           |           |          |           |
   *            |     0     |     1     |     2     |     3     |   . . .  |     W     |
   *            |           |           |           |           |          |           |
   *            |           |           |           |           |          |           |
   *            +-----------+-----------+-----------+-----------+---    ---+-----------+
   *            ^           ^           ^           ^                      ^           ^
   *            |           |           |           |                      |           |
   *            |           |           |           |                      |           |
   *           0/W       1/W          2/W          3/W                   W-1/W        W/W
   *
   */
  private build() {
    const p1 = this.config.p1;
    const p2 = this.config.p2;
    const p3 = this.config.p3;
    const p4 = this.config.p4;

    // compute x axis
    const w1 = new Cartesian3();
    const w2 = new Cartesian3();
    this.lengthOnWidthAxis = Cartesian3.distance(p1, p2);

    this.nbParticlesWidth = Math.floor(this.lengthOnWidthAxis / this.config.widthAxisParticleDistance);
    const xStep = 1 / this.nbParticlesWidth;
    // compute y axis
    const h1 = new Cartesian3();
    const h2 = new Cartesian3();
    this.lengthOnHeightAxis = Cartesian3.distance(p1, p4);

    this.nbParticlesHeight = Math.floor(this.lengthOnHeightAxis / this.config.heightAxisParticleDistance);
    const yStep = 1 / this.nbParticlesHeight;
    this.nbParticlesHeight++;
    this.nbParticlesWidth++;

    // init particles buffers
    this.initBuffers();

    // take the center of the cloth
    Cartesian3.lerp(p1, p4, 0.5, h1);
    Cartesian3.lerp(p2, p3, 0.5, h2);
    Cartesian3.lerp(p1, p2, 0.5, w1);
    Cartesian3.lerp(p4, p3, 0.5, w2);
    const center = intersect([w1.x, w1.y, w1.z], [w2.x, w2.y, w2.z], [h1.x, h1.y, h1.z], [h2.x, h2.y, h2.z]);
    if (center) {
      this.center = new Cartesian3(center[0] as number, center[1] as number, center[2] as number);
      const d1 = Cartesian3.distance(this.center, p1);
      const d2 = Cartesian3.distance(this.center, p2);
      const d3 = Cartesian3.distance(this.center, p3);
      const d4 = Cartesian3.distance(this.center, p4);
      this.radius = (d1 + d2 + d3 + d4) / 4;
    }

    let idt = 0;

    // sweeps the cloth and creates particles at every point in the space
    for (let py = 0; py < this.nbParticlesHeight; py++) {
      const y = yStep * py;
      Cartesian3.lerp(p1, p4, y, h1);
      Cartesian3.lerp(p2, p3, y, h2);
      for (let px = 0; px < this.nbParticlesWidth; px++) {
        const x = xStep * px;
        Cartesian3.lerp(p1, p2, x, w1);
        Cartesian3.lerp(p4, p3, x, w2);
        const pos = intersect([w1.x, w1.y, w1.z], [w2.x, w2.y, w2.z], [h1.x, h1.y, h1.z], [h2.x, h2.y, h2.z]);
        if (pos) {
          const idx = this.getIndex(px, py);
          this.initParticle(idx, pos[0] as number, pos[1] as number, pos[2] as number);
          this.particleTextureCoordinates[idt++] = x;
          this.particleTextureCoordinates[idt++] = y;
        } else {
          console.log('intersect failed !!!!!!!');
        }
      }
    }

    // build triangle indices
    this.buildTriangles();

    // Connecting immediate neighbor particles with constraints (distance 1 and sqrt(2) in the grid)
    for (let y = 0; y < this.nbParticlesHeight; y++) {
      for (let x = 0; x < this.nbParticlesWidth; x++) {
        if (x < this.nbParticlesWidth - 1) this.addConstraint(this.getIndex(x, y), this.getIndex(x + 1, y));
        if (y < this.nbParticlesHeight - 1) this.addConstraint(this.getIndex(x, y), this.getIndex(x, y + 1));
        if (x < this.nbParticlesWidth - 1 && y < this.nbParticlesHeight - 1)
          this.addConstraint(this.getIndex(x, y), this.getIndex(x + 1, y + 1));
        if (x < this.nbParticlesWidth - 1 && y < this.nbParticlesHeight - 1)
          this.addConstraint(this.getIndex(x + 1, y), this.getIndex(x, y + 1));
      }
    }

    // Connecting secondary neighbors with constraints (distance 2 and sqrt(4) in the grid)
    if (this.connectingSecondaryNeighbors) {
      for (let y = 0; y < this.nbParticlesHeight; y++) {
        for (let x = 0; x < this.nbParticlesWidth; x++) {
          if (x < this.nbParticlesWidth - 2) this.addConstraint(this.getIndex(x, y), this.getIndex(x + 2, y));
          if (y < this.nbParticlesHeight - 2) this.addConstraint(this.getIndex(x, y), this.getIndex(x, y + 2));
          if (x < this.nbParticlesWidth - 2 && y < this.nbParticlesHeight - 2)
            this.addConstraint(this.getIndex(x, y), this.getIndex(x + 2, y + 2));
          if (x < this.nbParticlesWidth - 2 && y < this.nbParticlesHeight - 2)
            this.addConstraint(this.getIndex(x + 2, y), this.getIndex(x, y + 2));
        }
      }
    }

    // Sets a side fixed
    //  for (let i = 0; i < this.nbParticlesWidth; i++) {
    //  this.setFixed(this.getIndex(i, 0), true);
    // }
  }

  /**
   * Sets particle data at the given index.
   * Attention, in order to increase the accuracy of the calculation and the WebGL
   * display, the coordinates are stored relative to the point P1 of the cloth.
   * The shader takes into account this delta and adds the right distance.
   * @param idx
   * @param posX
   * @param posY
   * @param posZ
   */
  private initParticle(idx: number, posX: number, posY: number, posZ: number) {
    // changes the position of the particle
    this.particlePositions[idx] = posX;
    this.particlePositions[idx + 1] = posY;
    this.particlePositions[idx + 2] = posZ;
    this.lastParticlePositions[idx] = posX;
    this.lastParticlePositions[idx + 1] = posY;
    this.lastParticlePositions[idx + 2] = posZ;
    // init the normal of the particle as (0,0,1) in catesian space
    this.particleNormals[idx] = 0;
    this.particleNormals[idx + 1] = 0;
    this.particleNormals[idx + 2] = 1;
    // init the acceleration of the particle as (0,0,0) in each axis
    this.particleAccelerations[idx] = 0;
    this.particleAccelerations[idx + 1] = 0;
    this.particleAccelerations[idx + 2] = 0;
    this.isPositionFixed[idx] = false;
  }

  /**
   * Get the index of the position of a particle element (position, normal, etc)
   */
  private getIndex(x: number, y: number): number {
    return y * (this.nbParticlesWidth * 3) + x * 3;
  }

  /**
   * Fixes or not the particle in the space.
   * Also Change the position of the particle if newPosition is given
   */
  public setFixed(idx: number, isFixed: boolean, newPosition?: Cartesian3) {
    this.isPositionFixed[idx] = isFixed;
    if (newPosition) {
      this.particlePositions[idx] = newPosition.x;
      this.particlePositions[idx + 1] = newPosition.y;
      this.particlePositions[idx + 2] = newPosition.z;
    }
  }

  // ------------------------------------------------------------------------------
  // ----- Triangles & Index
  // ------------------------------------------------------------------------------

  /**
   * Get the index of triangle for particle
   */
  private getTriangleIndex(x: number, y: number): number {
    return this.nbParticlesWidth * y + x;
  }

  /**
   * build triangles indices.
   * The cloth is seen as consisting of triangles for four particles in the grid as follows:
   *
   *       (x,y)   *--* (x+1,y)
   *               | /|
   *               |/ |
   *       (x,y+1) *--* (x+1,y+1)
   *
   *
   */
  private buildTriangles() {
    let idx = 0;
    let pos1 = 0;
    let pos2 = 0;
    let pos3 = 0;

    for (let y = 0; y < this.nbParticlesHeight - 1; y++) {
      for (let x = 0; x < this.nbParticlesWidth - 1; x++) {
        pos1 = this.getTriangleIndex(x, y);
        pos2 = this.getTriangleIndex(x + 1, y);
        pos3 = this.getTriangleIndex(x, y + 1);
        this.triangleIndices[idx++] = pos1;
        this.triangleIndices[idx++] = pos2;
        this.triangleIndices[idx++] = pos3;

        pos1 = this.getTriangleIndex(x + 1, y);
        pos2 = this.getTriangleIndex(x + 1, y + 1);
        pos3 = this.getTriangleIndex(x, y + 1);

        this.triangleIndices[idx++] = pos1;
        this.triangleIndices[idx++] = pos2;
        this.triangleIndices[idx++] = pos3;
      }
    }
  }

  // ------------------------------------------------------------------------------
  // ----- Shared Buffers
  // ------------------------------------------------------------------------------

  /**
   * Create buffer used by low level primitve (cesium/webgl)
   */
  private initBuffers() {
    this.vertexBufferCount = this.nbParticlesWidth * 3 * this.nbParticlesHeight;
    this.triangleIndicesCount = (this.nbParticlesWidth - 1) * (this.nbParticlesHeight - 1) * 2 * 3;
    this.particlePositionsSharedArrayBuffer = new SharedArrayBuffer(
      Float64Array.BYTES_PER_ELEMENT * this.vertexBufferCount,
    );
    this.particlePositionsSharedArrayBufferHigh = new SharedArrayBuffer(
      Float32Array.BYTES_PER_ELEMENT * this.vertexBufferCount,
    );
    this.particlePositionsSharedArrayBufferLow = new SharedArrayBuffer(
      Float32Array.BYTES_PER_ELEMENT * this.vertexBufferCount,
    );
    this.particleNormalsSharedArrayBuffer = new SharedArrayBuffer(
      Float32Array.BYTES_PER_ELEMENT * this.vertexBufferCount,
    );
    this.particleTextureCoordinatesSharedArrayBuffer = new SharedArrayBuffer(
      Float32Array.BYTES_PER_ELEMENT * (this.nbParticlesWidth * this.nbParticlesHeight) * 2,
    );
    this.triangleIndicesSharedArrayBuffer = new SharedArrayBuffer(
      Uint16Array.BYTES_PER_ELEMENT * this.triangleIndicesCount,
    );
    this.particlePositions = new Float64Array(this.particlePositionsSharedArrayBuffer);
    this.particlePositionsHigh = new Float32Array(this.particlePositionsSharedArrayBufferHigh);
    this.particlePositionsLow = new Float32Array(this.particlePositionsSharedArrayBufferLow);
    this.lastParticlePositions = new Float64Array(this.vertexBufferCount);
    this.particleNormals = new Float32Array(this.particleNormalsSharedArrayBuffer);
    this.particleTextureCoordinates = new Float32Array(this.particleTextureCoordinatesSharedArrayBuffer);
    this.particleAccelerations = new Float32Array(this.vertexBufferCount);
    this.isPositionFixed = new Array<boolean>(this.nbParticlesWidth * this.nbParticlesHeight);
    this.triangleIndices = new Uint16Array(this.triangleIndicesSharedArrayBuffer);
  }

  /**
   * Encodes a 64-bit floating-point value as two floating-point values.
   * Same as CesiumJS EncodedCartesian3.
   */
  private encodePositions() {
    const nbPos = this.particlePositions.length;
    for (let i = 0; i < nbPos; ++i) {
      const value = this.particlePositions[i];
      let doubleHigh;
      if (value >= 0.0) {
        doubleHigh = Math.floor(value / 65536.0) * 65536.0;
        this.particlePositionsHigh[i] = doubleHigh;
        this.particlePositionsLow[i] = value - doubleHigh;
      } else {
        doubleHigh = Math.floor(-value / 65536.0) * 65536.0;
        this.particlePositionsHigh[i] = -doubleHigh;
        this.particlePositionsLow[i] = value + doubleHigh;
      }
    }
  }

  // ------------------------------------------------------------------------------
  // ----- Utilities
  // ------------------------------------------------------------------------------

  /**Change the position of the given point using local coordinates frame
   *
   * @param pos
   * @param x
   * @param y
   * @param height
   * @returns
   */
  public changeLocalPosition(pos: Cartesian3, x: number, y: number, height: number) {
    const transform = Transforms.eastNorthUpToFixedFrame(pos);
    return Matrix4.multiplyByPoint(transform, new Cartesian3(x, y, height), new Cartesian3());
  }
}

// ------------------------------------------------------------------------------

/**
 * Constraint between two particles
 */
type Constraint = {
  /**
   * Index of the first particle in cloth
   */
  idx1: number;
  /**
   * Index of the second particle in cloth
   */
  idx2: number;

  /**
   *  Distance between particle p1 and p2
   */
  distance: number;
};
