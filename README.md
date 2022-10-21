# CesiumCloth
Cesium real-time cloth simulation primitive


See : https://www.flprogramming.fr/index.php/2022/10/17/physical-cloth-simulation-in-cesium/


## To launch the example : clone the repository then :

1. cd sample
2. npm install
3. npm start

## To use cesium-cloth in your project :

npm install cesium-cloth

        import Cloth from 'cesium-cloth/lib/cloth'
        import { ClothConfiguration } from 'cesium-cloth'

             // cesium viewer
             const viewer: Viewer = new Viewer(this.cesiumContainer.current, {
                selectionIndicator: true,
                animation: false, timeline: false,
                terrainProvider: createWorldTerrain()
              });


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


        }
   
     

      const cloth0 = new Cloth(viewer, conf0);
  

