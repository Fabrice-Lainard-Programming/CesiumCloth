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


// react
import React from 'react'
// cesium
import { Viewer, Cartesian3, Math as CesiumMath, createWorldTerrain, Color, createOsmBuildings } from "cesium";
// cloth 
import Cloth from 'cesium-cloth/lib/cloth'
import { ClothConfiguration } from 'cesium-cloth'
import { ClothForceAndCollisionMsg } from 'cesium-cloth'
import { ParticleState } from 'cesium-cloth'

// css 
import "../src/css/main.css"
import "cesium/Build/Cesium/Widgets/widgets.css";




/**
 * Cesium page
 */
export default class CesiumPage extends React.Component<{}, {}> {
  private cesiumContainer: React.RefObject<HTMLDivElement>;

  public constructor(props: any) {
    super(props);
    this.cesiumContainer = React.createRef();

  }



  public componentDidMount(): void {
    if (this.cesiumContainer.current) {

      const viewer: Viewer = new Viewer(this.cesiumContainer.current, {
        selectionIndicator: true,
        animation: false, timeline: false,
        terrainProvider: createWorldTerrain()
      });

      //  viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.globe.enableLighting = true;
      viewer.scene.debugShowFramesPerSecond = true;
      viewer.scene.globe.dynamicAtmosphereLighting = true;
      viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;

      viewer.scene.primitives.add(createOsmBuildings());

   

      const conf0: ClothConfiguration = {
        p1: Cartesian3.fromDegrees(7.7707136, 48.5971652, 300),
        p2: Cartesian3.fromDegrees(7.7722317, 48.5967519, 300),
        p3: Cartesian3.fromDegrees(7.7719393, 48.5963333, 300),
        p4: Cartesian3.fromDegrees(7.7703595, 48.5967253, 300),
        heightAxisParticleDistance: 4,
        widthAxisParticleDistance: 4,
        gravity: Cartesian3.ZERO,
        wind: Cartesian3.ZERO,
        texturePath: '/textures/flag-europe.png',
        color: Color.fromCssColorString("#239409"),
        useTexture: true,
        debugMode: false,
        updateFrequency: 30,
        



      }
      const conf1: ClothConfiguration = {
        p1: Cartesian3.fromDegrees(-0.75849652, 44.20897279, 200),
        p2: Cartesian3.fromDegrees(-0.74890494, 44.20712705, 200),
        p3: Cartesian3.fromDegrees(-0.75062156, 44.20455831, 200),
        p4: Cartesian3.fromDegrees(-0.75980544, 44.20514282, 200),
        heightAxisParticleDistance: 50,
        widthAxisParticleDistance: 60,
        gravity: Cartesian3.ZERO,
        wind: Cartesian3.ZERO,
        texturePath: '/textures/flag-europe.png',
        color: Color.fromCssColorString("#239409"),
        useTexture: true,
        debugMode: false,
        updateFrequency: 30,
        

      }

      const conf2: ClothConfiguration = {
        p1: Cartesian3.fromDegrees(-0.3042215, 44.3397801, 200),
        p2: Cartesian3.fromDegrees(-0.3039801, 44.3401139, 200),
        p3: Cartesian3.fromDegrees(-0.3014427, 44.3393849, 200),
        p4: Cartesian3.fromDegrees(-0.3016144, 44.3389629, 200),
        heightAxisParticleDistance: 20,
        widthAxisParticleDistance: 20,
        gravity: Cartesian3.ZERO,
        wind: Cartesian3.ZERO,
        texturePath: '/textures/white-microfiber-fabric-background.jpg',
        useTexture: true,
        color: Color.fromCssColorString("#9B59B6"),
        debugMode: false,
        updateFrequency: 30,
        

      }


      const onInitEvent = 
      (cloth: Cloth, nbParticlesWidth: number, nbParticlesHeight: number, particlePositions: SharedArrayBuffer) => {

        let fixedStates: ParticleState[] = [];
        // fixed particles on cloth :
        for (let x = 0; x < nbParticlesWidth; x++) {
          fixedStates.push({
            particleX: x,
            particleY: 0,
            isFixed: true,
          });
        }
        const f0: ClothForceAndCollisionMsg =
        {
          fixedParticles: fixedStates

        };
        return f0;
      };

      const cloth0 = new Cloth(viewer, conf0, onInitEvent);
      const cloth1 = new Cloth(viewer, conf1, onInitEvent);
      const cloth2 = new Cloth(viewer, conf2, onInitEvent);






      viewer.camera.flyTo({
        destination: cloth0.config.p1,
        orientation: {
          heading: CesiumMath.toRadians(0.0),
          pitch: CesiumMath.toRadians(-15.0),
        }
      });


      // add toolbar buttons
      this.createUI(viewer, cloth0, cloth1, cloth2);

    }
  }



  private forcesAdded = false;

  /**
   * Add user interface buttons
   * @param cloth1 
   * @param cloth2 
   */
  private createUI(viewer: Viewer, cloth0: Cloth, cloth1: Cloth, cloth2: Cloth) {
    const self = this;
    const toolbar = document.querySelector("div.cesium-viewer-toolbar");
    const modeButton = document.querySelector("span.cesium-sceneModePicker-wrapper");
    // Cloth1 button
    const c1Button = document.createElement("button");
    c1Button.classList.add("cesium-button", "cesium-toolbar-button", ".debugButton");
    c1Button.innerHTML = "C1";
    c1Button.addEventListener("click", ()=> {
      viewer.camera.flyTo({
        destination: cloth0.config.p1,
        orientation: {
          heading: CesiumMath.toRadians(0.0),
          pitch: CesiumMath.toRadians(-15.0),
        }
      });
    });
    toolbar!.insertBefore(c1Button, modeButton);
    // Cloth1 button
    const c2Button = document.createElement("button");
    c2Button.classList.add("cesium-button", "cesium-toolbar-button", ".debugButton");
    c2Button.innerHTML = "C2";
    c2Button.addEventListener("click", () => {
      viewer.camera.flyTo({
        destination: cloth1.config.p1,
        orientation: {
          heading: CesiumMath.toRadians(0.0),
          pitch: CesiumMath.toRadians(-15.0),
        }
      });
    });
    toolbar!.insertBefore(c2Button, modeButton);
    // Cloth2 button
    const c3Button = document.createElement("button");
    c3Button.classList.add("cesium-button", "cesium-toolbar-button", ".debugButton");
    c3Button.innerHTML = "C3";
    c3Button.addEventListener("click", ()=> {
      viewer.camera.flyTo({
        destination: cloth2.config.p1,
        orientation: {
          heading: CesiumMath.toRadians(0.0),
          pitch: CesiumMath.toRadians(-15.0),
        }
      });
    });
    toolbar!.insertBefore(c3Button, modeButton);
    // debug button
    const debgButton = document.createElement("button");
    debgButton.classList.add("cesium-button", "cesium-toolbar-button", ".debugButton");
    debgButton.innerHTML = "DBG";
    debgButton.addEventListener("click", () => {
      cloth0.toggleDebugMode();
      cloth1.toggleDebugMode();
      cloth2.toggleDebugMode();
    });
    toolbar!.insertBefore(debgButton, modeButton);
    // Texture button
    const txtButton = document.createElement("button");
    txtButton.classList.add("cesium-button", "cesium-toolbar-button", ".debugButton");
    txtButton.innerHTML = "TXT";
    txtButton.addEventListener("click", () =>{
      cloth0.config.useTexture = !cloth0.config.useTexture;
      cloth1.config.useTexture = !cloth1.config.useTexture;
      cloth2.config.useTexture = !cloth2.config.useTexture;
    });
    toolbar!.insertBefore(txtButton, modeButton);
    // Forces button
    const forcesButton = document.createElement("button");
    forcesButton.classList.add("cesium-button", "cesium-toolbar-button", ".debugButton");
    forcesButton.innerHTML = "F->";
    forcesButton.addEventListener("click", () => {

      self.forcesAdded = !self.forcesAdded;


      if (!self.forcesAdded) {
        const f0: ClothForceAndCollisionMsg =
        {
          gravity: Cartesian3.ZERO,
          wind: Cartesian3.ZERO,
          collisionSpheres: []
        };
        const f1: ClothForceAndCollisionMsg =
        {
          gravity: Cartesian3.ZERO,
          wind: Cartesian3.ZERO,
          collisionSpheres: []
        };

        const f2: ClothForceAndCollisionMsg =
        {
          gravity: Cartesian3.ZERO,
          wind: Cartesian3.ZERO,
          collisionSpheres: []
        };
        cloth0.updateClothForceAndCollision(f0);
        cloth1.updateClothForceAndCollision(f1);
        cloth2.updateClothForceAndCollision(f2);
      }
      else {
        const f0: ClothForceAndCollisionMsg =
        {
          wind: new Cartesian3(0.2, 0.1, 0.2),
        };
        const f1: ClothForceAndCollisionMsg =
        {
          wind: new Cartesian3(0, 0, 0.1),
          collisionSpheres: [
            {
              sphereCenter: Cartesian3.fromDegrees(-0.7584000, 44.2099341, 100),
              sphereDestination: Cartesian3.fromDegrees(-0.7493770, 44.2051044, 300),
              speed: 0.00001,
              sphereRadius: 80,
              id: -1
            }
          ]
        };

        const f2: ClothForceAndCollisionMsg =
        {
          wind: new Cartesian3(0, 0, 0.4),
        };
        cloth0.updateClothForceAndCollision(f0);
        cloth1.updateClothForceAndCollision(f1);
        cloth2.updateClothForceAndCollision(f2);
      }



    });
    toolbar!.insertBefore(forcesButton, modeButton);

  }

  public render(): React.ReactNode {
    return (
      <div style={{
        width: '100%',
        height: '100%',
      }}>
        <div id='cesiumContainer' ref={this.cesiumContainer} style={{
          width: '100%',
          height: '100%',
        }} />
      </div>
    );
  }
}
