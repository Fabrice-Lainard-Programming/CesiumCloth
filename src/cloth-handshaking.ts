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
import { Cartesian3 } from 'cesium';
// configuration used to build a cloth
import { ClothConfiguration } from './cloth-configuration';

// ------------------------------------------------------------------------------

/**
 * Command used to exchange messages between the main thread and the simulation worker
 */
export enum WorkerCmd {
  /**
   * Asks the worker to build a new cloth.
   * The associated parameter is BuildClothMsg
   */
  BuildCloth,
  /**
   * Asks the main thread that the cloth is builded to build a new cloth.
   * The associated parameter is ClothBuildedMsg
   */
  ClothBuilded,
  /**
   * Asks the main thread to redraw the cloth.
   * The associated parameter is RedrawClothMsg
   */
  RedrawCloth,

  /**
   * Add or remove forces and collision objects
   * The associated parameter is ClothForceAndCollisionMsg
   */
  UpdateClothForceAndCollision,

  /**
   * start or stop the simulation (default is stopped)
   * The associated parameter is StartStopSimulationMsg
   */
  startStopSimulation,
}



// ------------------------------------------------------------------------------

/**
 * The structure of a message between the worker and the main thread
 */
export type WorkerMessage = {
  /**
   * Type of operation
   */
  cmd: WorkerCmd;
  /**
   * Message parameter
   */
  param: any;
};

// ------------------------------------------------------------------------------

/**
 * Structure used when the main thread asks the worker thread that the cloth is to be created
 */
export type BuildClothMsg = {
  /**
   * New cloth identifier
   */
  clothID: number;
  /**
   * Spatial configuration of the thread
   */
  conf: ClothConfiguration;
};

// ------------------------------------------------------------------------------

/**
 * Structure used when the worker informs the main thread that the cloth is created
 */
export type ClothBuildedMsg = {
  /**
   * New cloth identifier
   */
  clothID: number;
  /**
   * Number of particles across the width
   */
  nbParticlesWidth: number;
  /**
   * Number of particles along the height
   */
  nbParticlesHeight: number;
  /**
   * Position of the particles in 64bits format
   * Used only if debug mode is enabled to draw particle positions in the main thread
   */
  particlePositions: SharedArrayBuffer;
  /**
   * The center of the cloth in cartesian space
   */
  center: Cartesian3;
  /**
   * The radius of the bounding sphere around the cloth
   */
  radius: number;
};

// ------------------------------------------------------------------------------


/**
 * Structure used when the main thread asks the worker thread to run or not the simulation loop
 */
 export type StartStopSimulationMsg = 
  {
    /**
     * if true, the simulation should running
     */
    run : boolean;
  }


// ------------------------------------------------------------------------------

/**
 * Structure used when the worker asks the main thread to refresh a fabric
 */
export type RedrawClothMsg = {
  /**
   * id of the cloth
   */
  clothID: number;

  /**
   * Position of the particles in 64bits format
   * Used only if debug mode is enabled to draw particle positions in the main thread
   */
  particlePositions: SharedArrayBuffer;

  /**
   * Position of the particles high bits.
   * Data are allocated in a SharedBuffer.
   * The position buffer is compressed for a better rendering precision.
   * (here the high part of the 64 bits word)
   */
  particlePositionsHigh: SharedArrayBuffer;

  /**
   * Position of the particles low bits.
   * Data are allocated in a SharedBuffer.
   * The position buffer is compressed for a better rendering precision.
   * (here the low part of the 64 bits word)
   */
  particlePositionsLow: SharedArrayBuffer;

  /**
   * normals buffer
   */
  normals: SharedArrayBuffer;

  /**
   * texture coordinates buffer
   */
  textureCoordinates: SharedArrayBuffer;

  /**
   * Triangles indices
   */
  triangleIndices: SharedArrayBuffer;

  /**
   * Number of particles across the width
   */
  nb_particles_width: number;

  /**
   * Number of particles along the height
   */
  nb_particles_height: number;

  /**
   * Collision on sphere
   */
  collisionSpheres?: CollisionSphere[];
};

// ------------------------------------------------------------------------------

/**
 * A state of particle in cloth plane
 */
export type ParticleState =
  {
    /**
     * particle X coordinate 
     */
    particleX: number;
    /**
     * particle Y coordinate 
     */
    particleY: number;
    /**
     * True if particle is fixed in space
     */
    isFixed : boolean;

    /**
     * Change the position of the particle
     */
    newPosition?: Cartesian3;
  };






/**
 * Structure used to add or remove forces and collision objects
 */
export type ClothForceAndCollisionMsg = {
  /**
   * Gravity vector
   */
  gravity?: Cartesian3;
  /**
   * Wind vector
   */
  wind?: Cartesian3;

  /**
   * List of spheres used to demonstrate the collision with the cloth
   */
  collisionSpheres?: CollisionSphere[];

  /**
   * Particles fixed in space
   */
  fixedParticles?: ParticleState[];


};

// ------------------------------------------------------------------------------

/**
 * A sphere 
 */
export type CollisionSphere = {
  /**
   * Center of the sphere
   */
  sphereCenter: Cartesian3;
  /**
   * Its radius
   */
  sphereRadius: number;
  /**
   * Destination (move to)
   */
  sphereDestination: Cartesian3;
  /**
   * Speed
   */
  speed: number;
  /**
   * internal
   */
  dt?: number;

  /**
   * internal
   */
  sphereGeometry?: any;
  /**
   * internal
   */
  id: number;
};


