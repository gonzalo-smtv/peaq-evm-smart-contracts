// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {MachineStationFactory} from "../src/machine-station/agung/MachineStationFactory.sol";

contract DeployGasStation is Script {
    function run() external returns (MachineStationFactory) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address stationManager = vm.envAddress("STATION_MANAGER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        MachineStationFactory factory = new MachineStationFactory(admin, stationManager);

        vm.stopBroadcast();

        console.log("MachineStationFactory deployed to:", address(factory));
        console.log("Admin address:", admin);
        console.log("Station Manager address:", stationManager);

        return factory;
    }
}
