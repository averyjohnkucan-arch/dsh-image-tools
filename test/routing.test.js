import test from 'node:test';
import assert from 'node:assert/strict';
import {routeImage} from '../lib/routing.js';

test('plain prompts and pictures of artwork select Qwen, while requested artistic output selects Krea',()=>{
 assert.equal(routeImage({prompt:'A bowl of green pears on a gray table'}).action,'generate_photograph');
 assert.equal(routeImage({prompt:'A studio photograph of a watercolor painting'}).action,'generate_photograph');
 assert.equal(routeImage({prompt:'A watercolor illustration of a sailboat'}).action,'generate_art');
 assert.equal(routeImage({prompt:'An illustrated scene',mode:'photo'}).action,'generate_photograph');
});

test('reference IDs and explicit edit language route to Qwen edits',()=>{
 assert.equal(routeImage({prompt:'Apply a watercolor style',image_ids:['image-id']}).action,'edit_image');
 assert.equal(routeImage({prompt:'Change the color in this photo to blue'}).action,'edit_image');
 assert.match(routeImage({prompt:'A sailboat',mode:'art',image_ids:['image-id']}).question,/edit/);
});

test('ambiguous prompts ask once and past attachments do not affect a new request',()=>{
 const event = {type:'user/message',data:{content:[{type:'image',attachment:{attachmentId:'image-id'}}]}};
 const recent = () => [event];
 const older = () => [event,{type:'user/message',data:{content:[]}}];
 assert.match(routeImage({prompt:'A sailboat at dusk'},recent).question,/reference/);
 assert.equal(routeImage({prompt:'A watercolor sailboat from scratch'},recent).action,'generate_art');
 assert.equal(routeImage({prompt:'A documentary still of a boat'},older).action,'generate_photograph');
 assert.match(routeImage({prompt:'A photorealistic watercolor horse'}).question,/photograph/);
});
