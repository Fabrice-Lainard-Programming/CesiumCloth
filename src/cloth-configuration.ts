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
import { Cartesian3, Color } from 'cesium';
 

// ------------------------------------------------------------------------------

/*
 * Defines a cloth in the cartesian space
 * Position of the cloth corners in cartesian coordinates (https://www.keene.edu/campus/maps/tool/)
 *
 *         P1 *---|----|----|----|----|----* p2
 *            |---|----|----|----|----|----|
 *            |---|----|----|----|----|----|
 *            |---|----|----|----|----|----|
 *            |---|----|----|----|----|----|
 *            |---|----|----|----|----|----|
 *         P4 *---|----|----|----|----|----* p3
 *
 */
export type ClothConfiguration = {
  /**
   * Cloth corner in cartesian coordinates
   */
  p1: Cartesian3;
  /**
   * Cloth corner in cartesian coordinates
   */
  p2: Cartesian3;
  /**
   * Cloth corner in cartesian coordinates
   */
  p3: Cartesian3;
  /**
   * Cloth corner in cartesian coordinates
   */
  p4: Cartesian3;
  /**
   * Distance between two particles on the horizontal axis
   */
  widthAxisParticleDistance: number;
  /**
   * Distance between two particles on the vertical axis
   */
  heightAxisParticleDistance: number;

 

  /**
   * How many iterations of constraint satisfaction each frame
   */
  nbSimulationIterations?: number;

  /**
   * Refresh frequency 
   */
  updateFrequency?: number;


  /**
   * Connect secondary neighbors for each particles
   */
   connectingSecondaryNeighbors? : boolean;


  /**
   * Texture path
   */
  texturePath?: string;

  /**
   * Color used to draw the cloth (used if no useTexture is false)
   */
  color: Color;

  /**
   * if true the texture is used, the color otherwise
   */
  useTexture: boolean;

  /**
   * If true, shows debug data
   */
  debugMode: boolean;
  /**
   * Gravity vector
   */
  gravity: Cartesian3;
  /**
   * Wind vector
   */
  wind: Cartesian3;
};
