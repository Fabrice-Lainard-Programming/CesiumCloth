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

import ReactDOM from 'react-dom/client'
import CesiumPage from './CesiumPage';

const root = ReactDOM.createRoot(
  document.getElementById('app') as HTMLElement
);
root.render(
   <div>
    <h1 className='title'>
     <a href={"https://github.com/Fabrice-Lainard-Programming/CesiumCloth"} className="title">{"Real-time cloth simulation for Cesium"}</a>
    </h1>
    <CesiumPage></CesiumPage>
  </div>
);

// @ts-ignore
module.hot.accept()

 