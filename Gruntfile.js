'use strict';

let fs = require('fs');
let glob = require('glob');
let packageInfo = require("./package.json");
let createDMG = require('electron-installer-dmg');
let installerDEB = require('electron-installer-debian');
let zip = require('electron-installer-zip');

module.exports = function(grunt) {

    require('load-grunt-tasks')(grunt);

    grunt.initConfig({
        electron: {
            macosBuild: {
                options: {
                    overwrite: true,
                    dir: '.',
                    out: 'build',
                    platform: 'darwin',
                    arch: 'x64',
                    icon: "app/icon/mac/icon.icns",
                    prune: true
                }
            },
            linuxBuild: {
                options: {
                    overwrite: true,
                    dir: '.',
                    out: 'build',
                    platform: 'linux',
                    arch: 'x64',
                    icon: "app/icon/png/512x512.png",
                    prune: true,
                    asar: true
                }
            },
            windowsBuild: {
                options: {
                    overwrite: true,
                    dir: '.',
                    out: 'build',
                    platform: 'win32',
                    arch: 'ia32',
                    icon: "app/icon/win/icon.ico",
                    prune: true,
                    asar: true
                }
            },
            windowsBuild2: {
                options: {
                    overwrite: true,
                    dir: '.',
                    out: 'build',
                    platform: 'win32',
                    arch: 'x64',
                    icon: "app/icon/win/icon.ico",
                    prune: true,
                    asar: true
                }
            }
        }
    });

    grunt.registerTask('createDMG', 'Create .dmg from .app file', function() {
        if (!fs.existsSync('build/installers')) fs.mkdirSync('build/installers');
        require("glob").sync("build/installers/*.dmg").forEach(fs.unlinkSync);

        let done = this.async();
        createDMG({
            overwrite: true,
            appPath: "build/jscoin-darwin-x64/jscoin.app",
            name: `jscoin_${packageInfo.version}_osx`,
            icon: "app/icon/mac/icon.icns",
            out: "build/installers/"
        }, function (err) {
            if(err) {
                grunt.log.error(err.message);
                return done(false);
            }
            grunt.log.writeln('DMG created');
            done();
        });

    });

    grunt.registerTask('createDEB', 'Create .deb for linux', function() {
        glob.sync("build/installers/*.deb").forEach(fs.unlinkSync);

        let options = {
            src: 'build/jscoin-linux-x64/',
            dest: 'build/installers/',
            arch: 'amd64',
            productDescription: "jscoin"
        };

        let done = this.async();
        installerDEB(options)
            .then(() => done())
            .catch(err => {
                grunt.log.error(err.message);
                done(false);
            })
    });

    grunt.registerTask('createZIP', 'Create zip for windows', function() {
        glob.sync("build/installers/*.zip").forEach(fs.unlinkSync);

        let opts = {
            dir: 'build/jscoin-win32-ia32/jscoin.exe',
            out: `build/installers/jscoin_${packageInfo.version}_win32.zip`
        };

        let done = this.async();
        zip(opts, function(err, res) {
            if (err) {
                grunt.log.error(err.message);
                return done(false);
            }
            done()
        });
    });

    grunt.registerTask('createZIP2', 'Create zip for windows', function() {
        let opts = {
            dir: 'build/jscoin-win32-x64/jscoin.exe',
            out: `build/installers/jscoin_${packageInfo.version}_win64.zip`
        };

        let done = this.async();
        zip(opts, function(err, res) {
            if (err) {
                grunt.log.error(err.message);
                return done(false);
            }
            done()
        });
    });

    grunt.registerTask('default', ['electron', 'createDMG', 'createDEB', 'createZIP', 'createZIP2']);
};
