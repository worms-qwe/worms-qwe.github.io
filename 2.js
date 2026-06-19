(function () {
    console.log("11111111");

    window.Account = window.Account || {};
    window.Account.hasPremium = () => true;

    document.createElement = new Proxy(document.createElement, {
        apply(target, thisArg, args) {
            if (args[0] === "video") {
                console.log("123123121234");

                let fakeVideo = target.apply(thisArg, args);

                fakeVideo.play = function () {
                    console.log("8995678569");
                    setTimeout(() => {
                        fakeVideo.ended = true;
                        fakeVideo.dispatchEvent(new Event("ended"));
                    }, 500);
                };

                return fakeVideo;
            }
            return target.apply(thisArg, args);
        }
    });

    function clearAdTimers() {
        console.log("--00000000--");
        let highestTimeout = setTimeout(() => {}, 0);
        for (let i = 0; i <= highestTimeout; i++) {
            clearTimeout(i);
            clearInterval(i);
        }
    }

    document.addEventListener("DOMContentLoaded", clearAdTimers);
})();