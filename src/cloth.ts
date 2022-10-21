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
import { Material, Cartesian3, PolylineCollection, Viewer, PointPrimitiveCollection, Color } from 'cesium';
const CesiumJS: any = require('cesiumSource/Cesium');
// primitive used to draw the cloth in3D
import { ClothPrimitive } from './cloth-primitive';
// handhsaking protocol between the worker and the main thread
import {
  WorkerMessage,
  WorkerCmd,
  ClothBuildedMsg,
  RedrawClothMsg,
  ClothForceAndCollisionMsg,
  CollisionSphere,
} from './cloth-handshaking';
// configuration used to build a cloth
import { ClothConfiguration } from './cloth-configuration';

// ------------------------------------------------------------------------------

/**
 * Unique cloth identifiers
 */
let clothIDs: number = 0;

// ------------------------------------------------------------------------------

export default class Cloth {
  /**
   * Cloth configuration
   */
  public config: ClothConfiguration;

  /**
   * The center of the cloth in cartesian space
   */
  public center = Cartesian3.ZERO;
  /**
   * The radius of the bounding sphere around the cloth
   */
  public radius = 1;

  /**
   * Unique identifier of the cloth
   */
  public clothID: number = 0;

  /**
   * Cesium viewer
   */
  private viewer: Viewer;

  /**
   * Points used for debugging
   */
  private pointPrimitiveCollection = new PointPrimitiveCollection();

  /**
   * Lines used for debugging
   */
  private polylineCollection = new PolylineCollection();

  /**
   * Cesium primitive used to draw the cloth
   */
  private primitive: ClothPrimitive | undefined;

  /**
   * Number of particles across the width
   */
  private nbParticlesWidth = 0;
  /**
   * Number of particles along the height
   */
  private nbParticlesHeight = 0;

  /**
   * Associated cloth thread
   */
  private worker: Worker | undefined;

  /**
   * True if 3D debug object are already created
   */
  private debugObjectCreated = false;

  /**
   * Used to show collison with sphere
   */
  private collisionSpheres: CollisionSphere[] = [];

  /**
   * Debug mode : used to show vertices
   */
  private debugVertex: Float64Array | undefined;
  /**
   * Debug mode : used to show normals of particles
   */
  private debugNormals: Float32Array | undefined;


  /**
   * true if this cloth is destroyed
   */
  private _destroyed = false;


  static textureCache = new Map<string, any>();


  /**
   * function called after the creation of the cloth
   */
  private onCreatedEvent: ((cloth: Cloth, nbParticlesWidth: number, nbParticlesHeight: number, particlePositions: SharedArrayBuffer) => ClothForceAndCollisionMsg | undefined) | undefined;

  /**
   * Creation of a 3D simulation object of a fabric
   * Builds a geometry based on the four corners of the cloth (given by the config object)
   * @param viewer cesium viewer
   * @param config the configuration
   * @param: onCreated called after the creation of the cloth
   */
  public constructor(viewer: Viewer, config: ClothConfiguration, onCreatedEvent?: (cloth: Cloth, nbParticlesWidth: number, nbParticlesHeight: number, particlePositions: SharedArrayBuffer) => ClothForceAndCollisionMsg | undefined) {
    this.viewer = viewer;
    this.clothID = clothIDs++;
    this.config = config;
    this.onCreatedEvent = onCreatedEvent;

    if (config.texturePath) {
      if (!Cloth.textureCache.has(config.texturePath)) {
        CesiumJS.Resource.createIfNeeded(config.texturePath)
          .fetchImage()
          .then((image: any) => {
            Cloth.textureCache.set(config.texturePath!,image);
            this.spawnWorker();
          });
      }
      else
      {
        this.spawnWorker();
      }
    }
    else
    {
      this.spawnWorker();
    }

    
  }


  /**
   * delete resources used by this cloth
   */
  public destroy() {
    console.log("Cloth-" + this.clothID + " destroyed");
    this._destroyed = true;
    // delete the web worker
    if (this.worker) {
      this.worker.terminate();
      delete this.worker;
      this.worker = undefined;
    }

    // delete the primitive
    if (this.primitive) {
      this.viewer.scene.primitives.remove(this.primitive);
      this.primitive = undefined;
    }
  }

  /**
   * Launches a worker and requests the creation of a cloth
   */
  private spawnWorker() {
    // the worker used to simulate cloths
    this.worker = new Worker(new URL('./cloth-simulation-worker.js', import.meta.url));
    // asks the worker to create the cloth
    const msg: WorkerMessage = {
      cmd: WorkerCmd.BuildCloth,
      param: { conf: this.config, clothID: this.clothID },
    };
    this.worker.postMessage(msg);
    // reception of messages from the worker
    this.worker.onmessage = (event: MessageEvent) => {
      this.onWorkerMessage(event);
    };
  }

  /**
   * Receives and processes messages from the worker
   * @param event
   */
  private onWorkerMessage(event: MessageEvent<any>) {
    if (this._destroyed) return;
    const msg: WorkerMessage = event.data;
    switch (msg.cmd) {
      case WorkerCmd.ClothBuilded:
        {
          const param: ClothBuildedMsg = msg.param;
          this.createDebugObjects();
          this.copyParam(param.nbParticlesWidth, param.nbParticlesHeight, param.center, param.radius);

          if (this.onCreatedEvent) {

            const clothForceAndCollisionMsg = this.onCreatedEvent(this, param.nbParticlesWidth, param.nbParticlesHeight, param.particlePositions);
            if (clothForceAndCollisionMsg) {
              this.updateClothForceAndCollision(clothForceAndCollisionMsg);
            }
          }

        }
        break;
      case WorkerCmd.RedrawCloth: {
        const param: RedrawClothMsg = msg.param;

        const particlePositions = new Float64Array(param.particlePositions);
        const particlePositionsHigh = new Float32Array(param.particlePositionsHigh);
        const particlePositionsLow = new Float32Array(param.particlePositionsLow);
        const normals = new Float32Array(param.normals);
        const textureCoordinates = new Float32Array(param.textureCoordinates);
        const triangleIndices = new Uint16Array(param.triangleIndices);

        this.refreshPrimitive(
          particlePositions,
          particlePositionsHigh,
          particlePositionsLow,
          normals,
          triangleIndices,
          textureCoordinates,
          param.nb_particles_width,
          param.nb_particles_height,
          param.collisionSpheres,
        );
      }
    }
  }



  /**
   * Start or stop the simulation loop
   * @param start 
   * @returns 
   */
  public startOrStopSimulationLoop(start: boolean) {

    if (this._destroyed) return;
    if (!this.worker) return;
    // asks the worker to start the cloth
    const msg: WorkerMessage = {
      cmd: WorkerCmd.startStopSimulation,
      param: { run: start },
    };
    this.worker.postMessage(msg);
  }


  /**
   * Add or remove forces and collision objects
   * @param clothForceAndCollisionMsg
   * @returns
   */
  public updateClothForceAndCollision(clothForceAndCollisionMsg: ClothForceAndCollisionMsg) {
    if (this._destroyed) return;
    if (!this.worker) return;
    // asks the worker to create the cloth
    const msg: WorkerMessage = {
      cmd: WorkerCmd.UpdateClothForceAndCollision,
      param: clothForceAndCollisionMsg,
    };
    this.worker.postMessage(msg);
  }

  /**
   *  Refreshes 3D data
   * @param particlePositions
   * @param particlePositionsHigh
   * @param particlePositionsLow
   * @param normals
   * @param indices
   * @param nbParticlesWidth
   * @param nbParticlesHeight
   * @param collisionSpheres
   */
  public refreshPrimitive(
    particlePositions: Float64Array,
    particlePositionsHigh: Float32Array,
    particlePositionsLow: Float32Array,
    normals: Float32Array,
    indices: Uint16Array,
    textureCoordinates: Float32Array,
    nbParticlesWidth: number,
    nbParticlesHeight: number,
    collisionSpheres?: CollisionSphere[],
  ) {
    if (!this.primitive) {
      this.primitive = new ClothPrimitive(
        this,
        particlePositionsHigh,
        particlePositionsLow,
        normals,
        indices,
        textureCoordinates,
        nbParticlesWidth,
        nbParticlesHeight,
        this.config.texturePath ? Cloth.textureCache.get(this.config.texturePath) :  undefined
      );
      this.viewer.scene.primitives.add(this.primitive);
    } else {
      this.primitive.refreshBuffers(particlePositionsHigh, particlePositionsLow, normals);
    }
    this.viewer.scene.requestRender();
    if (this.config.debugMode) {
      if (collisionSpheres) {
        let idx = 0;
        if (this.collisionSpheres.length === 0) {
          this.collisionSpheres = collisionSpheres;
        } else {
          this.collisionSpheres.forEach((s) => {
            if (collisionSpheres.length > 0) {
              const newS = collisionSpheres[idx++];
              if (newS.id === s.id) {
                s.speed = newS.speed;
                s.sphereCenter = newS.sphereCenter;
                s.sphereRadius = newS.sphereRadius;
              } else {
                this.collisionSpheres.push(newS);
              }
            }
          });
        }
      }
      this.debugVertex = particlePositions;
      this.debugNormals = normals.slice(0);
      if (this.debugVertex && this.debugNormals) {
        this.drawDebugObjects(this.debugVertex, this.debugNormals);
      }
    }
  }

  /**
   * Copy some parameters of the cloth object of the worker thread to the cloth object of
   * the main thread in order to display debugging objects.
   * @param nbParticlesWidth
   * @param nbParticlesHeight
   * @param center
   */
  public copyParam(nbParticlesWidth: number, nbParticlesHeight: number, center: Cartesian3, radius: number) {
    this.nbParticlesWidth = nbParticlesWidth;
    this.nbParticlesHeight = nbParticlesHeight;
    this.center = center;
    this.radius = radius;
  }

  /**
   * Get the index of the position of a particle element (position, normal, etc)
   */
  private getIndex(x: number, y: number): number {
    return y * (this.nbParticlesWidth * 3) + x * 3;
  }

  /**
   * Gets the position of the particle
   * @param idx
   * @returns
   */
  private getPosition(vertex: Float64Array, idx: number): Cartesian3 {
    return new Cartesian3(vertex[idx], vertex[idx + 1], vertex[idx + 2]);
  }

  /**
   * Gets the normal of the particle
   * @param idx
   * @returns
   */
  private getNormal(normals: Float32Array, idx: number): Cartesian3 {
    return new Cartesian3(normals[idx], normals[idx + 1], normals[idx + 2]);
  }

  /**
   * Toggle debug model on/off
   */
  public toggleDebugMode() {
    this.config.debugMode = !this.config.debugMode;
    if (this.config.debugMode && !this.debugObjectCreated) {
      this.createDebugObjects();
    }
    if (!this.config.debugMode && this.debugObjectCreated) {
      this.clearDebugObjects();
    }
  }

  /**
   * Create 3D objects used to show debug data
   * @param self
   */
  private createDebugObjects() {
    if (this.config.debugMode) {
      this.debugObjectCreated = true;
      this.viewer.scene.primitives.add(this.pointPrimitiveCollection);
      this.viewer.scene.primitives.add(this.polylineCollection);
    }
  }
  /**
   * Delete 3D objects used to show debug data
   * @param self
   */
  private clearDebugObjects() {
    if (!this.config.debugMode) {
      this.pointPrimitiveCollection.removeAll();
      this.polylineCollection.removeAll();
      this.collisionSpheres.forEach((s) => {
        if (s.sphereGeometry) {
          this.viewer.scene.primitives.remove(s.sphereGeometry);
          s.sphereGeometry = undefined;
        }
      });
      this.collisionSpheres = [];
    }
  }

  /**
   * Draw field as 3D points (debug)
   */
  private drawDebugObjects(vertex: Float64Array, normals: Float32Array) {
    if (this.config.debugMode) {
      this.pointPrimitiveCollection.removeAll();
      this.polylineCollection.removeAll();

      this.collisionSpheres.forEach((s) => {
        if (!s.sphereGeometry) {
          s.sphereGeometry = new CesiumJS.EllipsoidPrimitive({
            center: s.sphereCenter,
            radii: new Cartesian3(s.sphereRadius, s.sphereRadius, s.sphereRadius),
            debugShowBoundingVolume: true,
            material: Material.fromType(Material.ColorType),
          });
          s.sphereGeometry.material.uniforms.color = new Color(1.0, 1.0, 0.0, 0.0);
          this.viewer.scene.primitives.add(s.sphereGeometry);
        } else {
          s.sphereGeometry.center = s.sphereCenter;
        }
      });

      /*   
                  this.pointPrimitiveCollection.add({ position: this.config.p1, color: Color.RED, pixelSize: 5 });
                   this.pointPrimitiveCollection.add({ position: this.config.p2, color: Color.RED, pixelSize: 5 });
                   this.pointPrimitiveCollection.add({ position: this.config.p3, color: Color.RED, pixelSize: 5 });
                   this.pointPrimitiveCollection.add({ position: this.config.p4, color: Color.RED, pixelSize: 5 });*/
      for (let y = 0; y < this.nbParticlesHeight; y++) {
        for (let x = 0; x < this.nbParticlesWidth; x++) {
          this.drawParticle(x, y, vertex, normals);
        }
      }
    }
  }

  /**
   * Draw a particle (debug)
   */
  private drawParticle(x: number, y: number, vertex: Float64Array, normals: Float32Array) {
    const idx = this.getIndex(x, y);
    const pos = this.getPosition(vertex, idx);
    this.pointPrimitiveCollection.add({ position: pos, color: Color.fromCssColorString('#ECC111'), pixelSize: 4 });

    // normal
    const normal = this.getNormal(normals, idx);
    Cartesian3.multiplyByScalar(normal, 20, normal);
    const pn = Cartesian3.add(pos, normal, new Cartesian3());

    this.polylineCollection.add({
      positions: [pos, pn],
      width: 0.5,
      material: Material.fromType('Color', {
        color: Color.YELLOW,
      }),
    });
  }
}
