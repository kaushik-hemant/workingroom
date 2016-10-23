kurento_room.controller('callController', function ($scope, $http, $window, ServiceParticipant, ServiceRoom, Fullscreen, LxNotificationService, $routeParams, $q, $rootScope, $location) {
    //login code start
    var options;

    $http.get('/getAllRooms').
        success(function (data, status, headers, config) {
            console.log(JSON.stringify(data));
            $scope.listRooms = data;
        }).
        error(function (data, status, headers, config) {
        });

    $http.get('/getClientConfig').
        success(function (data, status, headers, config) {
            console.log(JSON.stringify(data));
            $scope.clientConfig = data;
        }).
        error(function (data, status, headers, config) {
        });
    $http.get('/getUpdateSpeakerInterval').
        success(function (data, status, headers, config) {
            $scope.updateSpeakerInterval = data
        }).
        error(function (data, status, headers, config) {
        });

    $http.get('/getThresholdSpeaker').
        success(function (data, status, headers, config) {
            $scope.thresholdSpeaker = data
        }).
        error(function (data, status, headers, config) {
        });

    var register = function (room) {

        if (!room)
            ServiceParticipant.showError($window, LxNotificationService, {
                error: {
                    message: "Username and room fields are both required"
                }
            });

        $scope.userName = room.userName;
        $scope.roomName = room.roomName;

        var wsUri = 'wss://' + location.host + '/room';

        //show loopback stream from server
        var displayPublished = $scope.clientConfig.loopbackRemote || false;
        //also show local stream when display my remote
        var mirrorLocal = $scope.clientConfig.loopbackAndLocal || false;

        var kurento = KurentoRoom(wsUri, function (error, kurento) {

            if (error)
                return console.log(error);

            //TODO token should be generated by the server or a 3rd-party component  
            //kurento.setRpcParams({token : "securityToken"});

            room = kurento.Room({
                room: $scope.roomName,
                user: $scope.userName,
                updateSpeakerInterval: $scope.updateSpeakerInterval,
                thresholdSpeaker: $scope.thresholdSpeaker
            });

            var localStream = kurento.Stream(room, {
                audio: true,
                video: true,
                data: false
            });

            localStream.addEventListener("access-accepted", function () {
                room.addEventListener("room-connected", function (roomEvent) {
                    var streams = roomEvent.streams;
                    if (displayPublished) {
                        localStream.subscribeToMyRemote();
                    }
                    localStream.publish();
                    ServiceRoom.setLocalStream(localStream.getWebRtcPeer());
                    for (var i = 0; i < streams.length; i++) {
                        ServiceParticipant.addParticipant(streams[i]);
                    }
                });

                room.addEventListener("stream-published", function (streamEvent) {
                    ServiceParticipant.addLocalParticipant(localStream);
                    if (mirrorLocal && localStream.displayMyRemote()) {
                        var localVideo = kurento.Stream(room, {
                            video: true,
                            id: "localStream"
                        });
                        localVideo.mirrorLocalStream(localStream.getWrStream());
                        ServiceParticipant.addLocalMirror(localVideo);
                    }
                });

                room.addEventListener("stream-added", function (streamEvent) {
                    ServiceParticipant.addParticipant(streamEvent.stream);
                });

                room.addEventListener("stream-removed", function (streamEvent) {
                    ServiceParticipant.removeParticipantByStream(streamEvent.stream);
                });

                room.addEventListener("newMessage", function (msg) {
                    ServiceParticipant.showMessage(msg.room, msg.user, msg.message);
                });

                room.addEventListener("error-room", function (error) {
                    ServiceParticipant.showError($window, LxNotificationService, error);
                });

                room.addEventListener("error-media", function (msg) {
                    ServiceParticipant.alertMediaError($window, LxNotificationService, msg.error, function (answer) {
                        console.warn("Leave room because of error: " + answer);
                        if (answer) {
                            kurento.close(true);
                        }
                    });
                });

                room.addEventListener("room-closed", function (msg) {
                    if (msg.room !== $scope.roomName) {
                        console.error("Closed room name doesn't match this room's name",
                            msg.room, $scope.roomName);
                    } else {
                        kurento.close(true);
                        ServiceParticipant.forceClose($window, LxNotificationService, 'Room '
                            + msg.room + ' has been forcibly closed from server');
                    }
                });

                room.addEventListener("lost-connection", function (msg) {
                    kurento.close(true);
                    ServiceParticipant.forceClose($window, LxNotificationService,
                        'Lost connection with room "' + msg.room +
                        '". Please try reloading the webpage...');
                });

                room.addEventListener("stream-stopped-speaking", function (participantId) {
                    ServiceParticipant.streamStoppedSpeaking(participantId);
                });

                room.addEventListener("stream-speaking", function (participantId) {
                    ServiceParticipant.streamSpeaking(participantId);
                });

                room.addEventListener("update-main-speaker", function (participantId) {
                    ServiceParticipant.updateMainSpeaker(participantId);
                });

                room.connect();
            });

            localStream.addEventListener("access-denied", function () {
                ServiceParticipant.showError($window, LxNotificationService, {
                    error: {
                        message: "Access not granted to camera and microphone"
                    }
                });
            });
            localStream.init();
        });

        //save kurento & roomName & userName in service
        ServiceRoom.setKurento(kurento);
        ServiceRoom.setRoomName($scope.roomName);
        ServiceRoom.setUserName($scope.userName);
    };

    var room = {
        roomName: $routeParams.eventId,
        token: $routeParams.accessToken,
        username: $routeParams.user
    };
    console.log('room found from url');
    var deferred = $q.defer();
    var req = 'https://localhost:44300/api/common/checkroomaccess?eventId=' + room.roomName + '&accessToken=' + room.token + '&user=' + room.username;
    $http.get(req)
        .then(function (response) {
            deferred.resolve(response);
            var result = response;
            console.log(result);
            if (result.data.status === 200 && result.data.isValid) {
                register(room);
                if ($rootScope.isParticipant) {
                    console.log('here we have to check');
                    //todo set here parmas and login acc to that else redirect to error
                    return true;
                } else {
                    $location.path($rootScope.contextpath + '/');
                    return false;
                }
            } else {
                $location.path($rootScope.contextpath + '/');
                return false;
            }
        })
        .then(function (response) {
            deferred.reject(response);
        });





    //login code ends

    $scope.roomName = ServiceRoom.getRoomName();
    $scope.userName = ServiceRoom.getUserName();
    $scope.participants = ServiceParticipant.getParticipants();
    $scope.kurento = ServiceRoom.getKurento();

    $scope.leaveRoom = function () {

        ServiceRoom.getKurento().close();

        ServiceParticipant.removeParticipants();

        //redirect to login
        $window.location.href = '#/';
    };

    window.onbeforeunload = function () {
        //not necessary if not connected
        if (ServiceParticipant.isConnected()) {
            ServiceRoom.getKurento().close();
        }
    };


    $scope.goFullscreen = function () {

        if (Fullscreen.isEnabled())
            Fullscreen.cancel();
        else
            Fullscreen.all();

    };

    $scope.disableMainSpeaker = function (value) {

        var element = document.getElementById("buttonMainSpeaker");
        if (element.classList.contains("md-person")) { //on
            element.classList.remove("md-person");
            element.classList.add("md-recent-actors");
            ServiceParticipant.enableMainSpeaker();
        } else { //off
            element.classList.remove("md-recent-actors");
            element.classList.add("md-person");
            ServiceParticipant.disableMainSpeaker();
        }
    }

    $scope.onOffVolume = function () {
        var localStream = ServiceRoom.getLocalStream();
        var element = document.getElementById("buttonVolume");
        if (element.classList.contains("md-volume-off")) { //on
            element.classList.remove("md-volume-off");
            element.classList.add("md-volume-up");
            localStream.audioEnabled = true;
        } else { //off
            element.classList.remove("md-volume-up");
            element.classList.add("md-volume-off");
            localStream.audioEnabled = false;

        }
    };

    $scope.onOffVideocam = function () {
        var localStream = ServiceRoom.getLocalStream();
        var element = document.getElementById("buttonVideocam");
        if (element.classList.contains("md-videocam-off")) {//on
            element.classList.remove("md-videocam-off");
            element.classList.add("md-videocam");
            localStream.videoEnabled = true;
        } else {//off
            element.classList.remove("md-videocam");
            element.classList.add("md-videocam-off");
            localStream.videoEnabled = false;
        }
    };

    $scope.disconnectStream = function () {
        var localStream = ServiceRoom.getLocalStream();
        var participant = ServiceParticipant.getMainParticipant();
        if (!localStream || !participant) {
            LxNotificationService.alert('Error!', "Not connected yet", 'Ok', function (answer) {
            });
            return false;
        }
        ServiceParticipant.disconnectParticipant(participant);
        ServiceRoom.getKurento().disconnectParticipant(participant.getStream());
    }

    //chat
    $scope.message;

    $scope.sendMessage = function () {
        console.log("Sending message", $scope.message);
        var kurento = ServiceRoom.getKurento();
        kurento.sendMessage($scope.roomName, $scope.userName, $scope.message);
        $scope.message = "";
    };

    //open or close chat when click in chat button
    $scope.toggleChat = function () {
        var selectedEffect = "slide";
        // most effect types need no options passed by default
        var options = { direction: "right" };
        if ($("#effect").is(':visible')) {
            $("#content").animate({ width: '100%' }, 500);
        } else {
            $("#content").animate({ width: '80%' }, 500);
        }
        // run the effect
        $("#effect").toggle(selectedEffect, options, 500);
    };

    $scope.showHat = function () {
        var targetHat = false;
        var offImgStyle = "md-mood";
        var offColorStyle = "btn--deep-purple";
        var onImgStyle = "md-face-unlock";
        var onColorStyle = "btn--purple";
        var element = document.getElementById("hatButton");
        if (element.classList.contains(offImgStyle)) { //off
            element.classList.remove(offImgStyle);
            element.classList.remove(offColorStyle);
            element.classList.add(onImgStyle);
            element.classList.add(onColorStyle);
            targetHat = true;
        } else if (element.classList.contains(onImgStyle)) { //on
            element.classList.remove(onImgStyle);
            element.classList.remove(onColorStyle);
            element.classList.add(offImgStyle);
            element.classList.add(offColorStyle);
            targetHat = false;
        }

        var hatTo = targetHat ? "on" : "off";
        console.log("Toggle hat to " + hatTo);
        ServiceRoom.getKurento().sendCustomRequest({ hat: targetHat }, function (error, response) {
            if (error) {
                console.error("Unable to toggle hat " + hatTo, error);
                LxNotificationService.alert('Error!', "Unable to toggle hat " + hatTo,
                    'Ok', function (answer) { });
                return false;
            } else {
                console.debug("Response on hat toggle", response);
            }
        });
    };
});


